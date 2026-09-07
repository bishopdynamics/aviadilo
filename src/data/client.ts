import { validateContract } from '../config/validate';
import type { HaAdapter, Unsubscribe } from './ha';
import type { Command, Info, SnapshotEvent } from './types';

export type Selection = Omit<
  Extract<Command, { type: 'aviadilo/subscribe' }>,
  'type' | 'id' | 'schema_version' | 'revision'
>;
export type ClientState =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'unavailable'
  | 'disposed';
export interface ClientCallbacks {
  event?: (event: SnapshotEvent) => void;
  info?: (info: Info) => void;
  state?: (state: ClientState) => void;
  error?: (error: Error) => void;
}
export interface RadarTile {
  product: string;
  frame: string;
  z: number;
  x: number;
  y: number;
  size?: 256 | 512;
  style?: string;
}
type Manifest = Extract<SnapshotEvent, { kind: 'radar-manifest' }>;
interface ImageEntry {
  url: string;
  bytes: number;
  frame: string;
}
const MAX_ID = 2147483647;
const MAX_BYTES = 2 * 1024 * 1024;

export function parseInfo(value: unknown): Info {
  validateContract('info', value);
  return value as Info;
}
export function parseEvent(value: unknown): SnapshotEvent {
  validateContract('event', value);
  return value as SnapshotEvent;
}
function aborted(): DOMException {
  return new DOMException('Aviadilo work canceled', 'AbortError');
}

/** Abort/timeout wrappers cannot cancel a HA command already on the wire.
 * Generations ignore its late response; late subscriptions are always unsubscribed.
 */
function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  milliseconds = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(aborted());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Aviadilo response timed out'));
    }, milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) cancel();
  });
}

export class AviadiloClient {
  private selection: Selection;
  private revision = 0;
  private sentRevision = -1;
  private subscription?: number;
  private generation = 0;
  private visible = typeof document === 'undefined' || !document.hidden;
  private enabled = true;
  private disposed = false;
  private running = false;
  private unsubscribe?: Unsubscribe;
  private lifetime = new AbortController();
  private tiles = new AbortController();
  private debounce?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setTimeout>;
  private retry?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;
  private updateReady = false;
  private updating = false;
  private manifest?: Manifest;
  private images = new Map<string, ImageEntry>();
  private pending = new Map<string, Promise<string>>();
  private unlisten: () => void;
  private stateValue: ClientState = 'idle';
  private readonly visibility = () => this.setVisible(!document.hidden);

  constructor(
    private readonly ha: HaAdapter,
    selection: Selection,
    private readonly callbacks: ClientCallbacks = {},
  ) {
    this.selection = this.checkSelection(selection);
    this.unlisten = ha.listen(() => {
      this.stop();
      this.start();
    });
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.visibility);
    this.start();
  }
  get state(): ClientState {
    return this.stateValue;
  }
  get currentRevision(): number {
    return this.revision;
  }
  get subscriptionId(): number | undefined {
    return this.subscription;
  }
  private stateChanged(value: ClientState): void {
    this.stateValue = value;
    this.callbacks.state?.(value);
  }
  private checkSelection(value: Selection): Selection {
    validateContract('command', {
      ...value,
      schema_version: 1,
      type: 'aviadilo/subscribe',
      id: 1,
      revision: this.revision,
    });
    return structuredClone(value);
  }
  setSelection(value: Selection): void {
    const next = this.checkSelection(value);
    if (JSON.stringify(next) === JSON.stringify(this.selection)) return;
    if (this.revision >= MAX_ID)
      throw new Error('Aviadilo revision limit reached; recreate client');
    const entryChanged = this.selection.entry_id !== next.entry_id;
    this.selection = next;
    this.revision++;
    this.clearTiles();
    this.manifest = undefined;
    clearTimeout(this.debounce);
    this.updateReady = false;
    if (entryChanged) {
      this.stop();
      this.start();
      return;
    }
    this.debounce = setTimeout(() => {
      this.updateReady = true;
      void this.flush();
    }, 300);
  }
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.stop();
    this.start();
  }
  setActive(active: boolean): void {
    if (this.enabled === active) return;
    this.enabled = active;
    this.stop();
    this.start();
  }
  private wanted(): boolean {
    return this.visible && this.enabled && !this.disposed && this.ha.connected;
  }
  private valid(generation: number): boolean {
    return generation === this.generation && this.wanted();
  }
  private start(): void {
    if (!this.wanted() || this.running) return;
    this.running = true;
    const generation = this.generation;
    this.stateChanged('connecting');
    if (this.valid(generation)) void this.connect(generation);
  }
  private async connect(generation: number): Promise<void> {
    try {
      const info = parseInfo(
        await bounded(
          this.ha.call({
            type: 'aviadilo/info',
            schema_version: 1,
            entry_id: this.selection.entry_id,
          }),
          this.lifetime.signal,
        ),
      );
      if (!this.valid(generation)) return;
      this.callbacks.info?.(info);
      if (!this.valid(generation)) return;
      if (info.entry_id !== this.selection.entry_id)
        throw new Error('Aviadilo integration is unavailable');
      const revision = this.revision;
      this.sentRevision = revision;
      this.handshake = setTimeout(
        () =>
          this.fail(
            new Error('Aviadilo subscription handshake timed out'),
            generation,
          ),
        10000,
      );
      const promise = this.ha.subscribe(
        {
          ...this.selection,
          type: 'aviadilo/subscribe',
          schema_version: 1,
          revision,
        },
        (value) => this.receive(value, generation, revision),
      );
      // Resolution and the await continuation can straddle a visibility
      // microtask. Both paths share the same idempotent cancellation function.
      let released = false;
      const release = async (unsubscribe: Unsubscribe): Promise<void> => {
        if (released) return;
        released = true;
        await unsubscribe();
      };
      void promise.then(
        (unsubscribe) => {
          if (!this.valid(generation))
            void release(unsubscribe).catch(() => undefined);
        },
        () => undefined,
      );
      const unsubscribe = await bounded(promise, this.lifetime.signal);
      if (!this.valid(generation)) {
        void release(unsubscribe).catch(() => undefined);
        return;
      }
      this.unsubscribe = () => release(unsubscribe);
    } catch (error) {
      this.fail(error, generation);
    }
  }
  private receive(
    value: unknown,
    generation: number,
    initialRevision: number,
  ): void {
    if (!this.valid(generation)) return;
    try {
      const event = parseEvent(value);
      // Establish the ID even when an edit advanced desired revision during setup.
      if (this.subscription === undefined) {
        if (event.revision !== initialRevision || event.kind !== 'status')
          return;
        this.subscription = event.subscription_id;
        clearTimeout(this.handshake);
        this.stateChanged('active');
        if (!this.valid(generation)) return;
        this.scheduleHeartbeat(generation);
        void this.flush();
      }
      if (event.subscription_id !== this.subscription) return;
      if (
        event.kind === 'status' &&
        event.statuses.some(
          (status) =>
            status.message === 'aviadilo:closed' ||
            status.message === 'aviadilo:lease_expired',
        )
      ) {
        this.fail(
          new Error('Aviadilo subscription ended; reconnecting'),
          generation,
        );
        return;
      }
      if (event.revision !== this.revision) return;
      if (event.kind === 'radar-manifest') {
        if (
          !this.selection.layers.radar ||
          event.provider !== this.selection.radar_provider
        )
          return;
        this.manifest = event;
        const frames = new Set(event.frames.map((frame) => frame.id));
        for (const [key, entry] of this.images)
          if (!frames.has(entry.frame)) this.releaseTile(key);
      }
      if (
        (event.kind === 'aircraft' && !this.selection.layers.aircraft) ||
        (event.kind === 'wind-grid' && !this.selection.layers.wind)
      )
        return;
      this.callbacks.event?.(event);
    } catch (error) {
      this.fail(error, generation);
    }
  }
  private async flush(): Promise<void> {
    if (
      !this.wanted() ||
      !this.updateReady ||
      this.subscription === undefined ||
      this.updating ||
      this.sentRevision === this.revision
    )
      return;
    const generation = this.generation;
    this.updating = true;
    this.sentRevision = this.revision;
    try {
      await bounded(
        this.ha.call({
          ...this.selection,
          type: 'aviadilo/update_subscription',
          schema_version: 1,
          subscription_id: this.subscription,
          revision: this.revision,
        }),
        this.lifetime.signal,
      );
    } catch (error) {
      this.fail(error, generation);
    } finally {
      if (this.valid(generation)) {
        this.updating = false;
        void this.flush();
      }
    }
  }
  private scheduleHeartbeat(generation: number): void {
    this.heartbeat = setTimeout(() => {
      void this.beat(generation);
    }, 20000);
  }
  private async beat(generation: number): Promise<void> {
    if (!this.valid(generation) || this.subscription === undefined) return;
    try {
      await bounded(
        this.ha.call({
          type: 'aviadilo/heartbeat',
          schema_version: 1,
          subscription_id: this.subscription,
        }),
        this.lifetime.signal,
        5000,
      );
      if (this.valid(generation)) this.scheduleHeartbeat(generation);
    } catch (error) {
      this.fail(error, generation);
    }
  }
  private fail(error: unknown, generation: number): void {
    if (!this.valid(generation)) return;
    this.callbacks.error?.(
      error instanceof Error ? error : new Error('Aviadilo request failed'),
    );
    this.stop();
    this.stateChanged('unavailable');
    this.retry = setTimeout(() => this.start(), 5000);
  }
  private stop(): void {
    this.generation++;
    this.running = false;
    this.subscription = undefined;
    this.sentRevision = -1;
    this.updating = false;
    this.lifetime.abort();
    this.lifetime = new AbortController();
    clearTimeout(this.debounce);
    clearTimeout(this.heartbeat);
    clearTimeout(this.retry);
    clearTimeout(this.handshake);
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    if (unsubscribe) void unsubscribe().catch(() => undefined);
    this.manifest = undefined;
    this.clearTiles();
    if (!this.disposed) this.stateChanged('idle');
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.unlisten();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visibility);
    this.stateChanged('disposed');
  }

  /** Returns a bounded object URL. Rendering code releases it when a tile leaves
   * view; all URLs are revoked on source/viewport edits, hide, or disposal.
   */
  async loadTile(tile: RadarTile): Promise<string> {
    const manifest = this.manifest;
    if (
      !this.wanted() ||
      this.subscription === undefined ||
      !manifest ||
      !this.selection.layers.radar ||
      tile.product !== manifest.product ||
      !manifest.frames.some((frame) => frame.id === tile.frame) ||
      !Number.isInteger(tile.z) ||
      tile.z < 0 ||
      tile.z > manifest.native_max_zoom ||
      !Number.isInteger(tile.x) ||
      tile.x < 0 ||
      tile.x >= 2 ** tile.z ||
      !Number.isInteger(tile.y) ||
      tile.y < 0 ||
      tile.y >= 2 ** tile.z ||
      ![256, 512].includes(tile.size ?? 256) ||
      (tile.style ?? 'default').length > 256
    )
      throw new Error('Tile is not currently available');
    const query = new URLSearchParams({
      entry_id: this.selection.entry_id,
      provider: manifest.provider,
      product: tile.product,
      frame: tile.frame,
      z: String(tile.z),
      x: String(tile.x),
      y: String(tile.y),
      size: String(tile.size ?? 256),
      style: tile.style ?? 'default',
      subscription_id: String(this.subscription),
      revision: String(this.revision),
      schema_version: '1',
    });
    const key = `/api/aviadilo/radar?${query.toString()}`;
    const existing = this.images.get(key);
    if (existing) {
      this.images.delete(key);
      this.images.set(key, existing);
      return existing.url;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 8)
      throw new Error('Aviadilo tile request limit reached');
    const signal = this.tiles.signal;
    const promise = this.fetchTile(key, tile, signal);
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    }
  }
  private async fetchTile(
    key: string,
    tile: RadarTile,
    signal: AbortSignal,
  ): Promise<string> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 150000);
    const requestSignal = AbortSignal.any([signal, deadline.signal]);
    try {
      return await this.readTile(key, tile, requestSignal);
    } finally {
      clearTimeout(timer);
    }
  }
  private async readTile(
    key: string,
    tile: RadarTile,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await bounded(this.ha.fetch(key, signal), signal, 150000);
    if (
      !response.ok ||
      response.headers.get('Content-Type')?.split(';')[0] !== 'image/png' ||
      Number(response.headers.get('Content-Length') ?? 0) > MAX_BYTES ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new Error('Radar image is unavailable');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await bounded(reader.read(), signal, 150000);
        if (signal.aborted) throw aborted();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_BYTES)
          throw new Error('Radar image exceeds byte limit');
        chunks.push(new Uint8Array(chunk.value));
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (
      signal.aborted ||
      !this.manifest?.frames.some((frame) => frame.id === tile.frame)
    )
      throw aborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const view = new DataView(bytes.buffer);
    const size = tile.size ?? 256;
    if (
      length < 33 ||
      signature.some((value, index) => bytes[index] !== value) ||
      view.getUint32(16) !== size ||
      view.getUint32(20) !== size
    )
      throw new Error('Invalid radar PNG dimensions');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    this.images.set(key, { url, bytes: size * size * 4, frame: tile.frame });
    while (
      new Set([...this.images.values()].map((entry) => entry.frame)).size > 3 ||
      [...this.images.values()].reduce(
        (total, entry) => total + entry.bytes,
        0,
      ) >
        32 * 1024 * 1024
    ) {
      this.releaseTile(this.images.keys().next().value!);
    }
    return url;
  }
  releaseTile(urlOrKey: string): void {
    for (const [key, entry] of this.images)
      if (key === urlOrKey || entry.url === urlOrKey) {
        URL.revokeObjectURL(entry.url);
        this.images.delete(key);
        break;
      }
  }
  private clearTiles(): void {
    this.tiles.abort();
    this.tiles = new AbortController();
    this.pending.clear();
    for (const entry of this.images.values()) URL.revokeObjectURL(entry.url);
    this.images.clear();
  }
}
