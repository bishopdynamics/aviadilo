/** Asset transport v1 and connection-scoped decoded resource ownership.
 * Renderers share acquireAssets per HA connection and release decoded leases.
 * Transport and decoded retention have independent bounded lifetimes.
 * A 409 reconciles once; it never retries a GET.
 */
import { validateContract } from '../config/validate';
import type {
  AssetErrorBody,
  AssetInfo,
  BasemapRequest,
  PhotoRequest,
} from './asset-types';
import {
  createHaAdapter,
  type HaAdapter,
  type HassTransport,
  type Unsubscribe,
} from './ha';

export const GENERATION_HEADER = 'X-Aviadilo-Generation';
export const ASSETS_CHANGED = 'aviadilo/assets_changed';
export const ASSET_LIMITS = Object.freeze({
  active: 8,
  pending: 128,
  bytes: 2 * 1024 * 1024,
});
export type AssetRequest = BasemapRequest | PhotoRequest;
export const ERROR_STATUS = Object.freeze({
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  stale_generation: 409,
  picture_changed: 409,
  busy: 429,
  upstream_error: 502,
  unavailable: 503,
});
export class AssetFailure extends Error {
  constructor(
    readonly code: AssetErrorBody['code'],
    readonly localCapacity = false,
  ) {
    super(
      {
        invalid_request: 'Invalid asset request',
        unauthorized: 'Authentication required',
        forbidden: 'Asset access denied',
        not_found: 'Asset or entry is unavailable',
        stale_generation: 'Asset generation has changed',
        picture_changed: 'Entity picture has changed',
        busy: 'Asset capacity reached',
        upstream_error: 'Asset source is unavailable',
        unavailable: 'Asset service is unavailable',
      }[code],
    );
  }
}
const abortError = () =>
  new DOMException('Asset request cancelled', 'AbortError');
function checked(value: unknown): void {
  try {
    validateContract('assets', value);
  } catch {
    throw new AssetFailure('invalid_request');
  }
}
export function parseAssetInfo(value: unknown): AssetInfo {
  checked(value);
  if (
    !value ||
    typeof value !== 'object' ||
    'kind' in value ||
    'type' in value ||
    'code' in value
  )
    throw new AssetFailure('invalid_request');
  return Object.freeze({ ...(value as AssetInfo) });
}
export function parseAssetError(
  value: unknown,
  status: number,
): AssetErrorBody {
  checked(value);
  if (
    !value ||
    typeof value !== 'object' ||
    !('code' in value) ||
    ERROR_STATUS[(value as AssetErrorBody).code] !== status
  )
    throw new AssetFailure('upstream_error');
  return value as AssetErrorBody;
}
export function buildAssetPath(request: AssetRequest): string {
  checked(request);
  if (request.kind !== 'basemap' && request.kind !== 'photo')
    throw new AssetFailure('invalid_request');
  const query = new URLSearchParams({
    schema_version: '1',
    generation: request.generation,
  });
  if (request.entry_id !== undefined) query.set('entry_id', request.entry_id);
  if (request.kind === 'basemap')
    return `/api/aviadilo/basemap/${request.z}/${request.x}/${request.y}?${query}`;
  query.set('entity_id', request.entity_id);
  query.set('picture_key', request.picture_key);
  return `/api/aviadilo/photo?${query}`;
}
export function parseAssetPath(path: string): AssetRequest {
  // Match raw paths before URL normalization can erase traversal or backslashes.
  const match =
    /^\/api\/aviadilo\/(photo|basemap\/(0|[1-9][0-9]{0,5})\/(0|[1-9][0-9]{0,5})\/(0|[1-9][0-9]{0,5}))\?([^#\\\s]+)(?![\s\S])/.exec(
      path,
    );
  if (!match || /%(?![0-9a-f]{2})/i.test(path))
    throw new AssetFailure('invalid_request');
  const query = new URLSearchParams(match[5]);
  const keys = [...query.keys()];
  const allowed = [
    'schema_version',
    'generation',
    'entry_id',
    ...(match[1] === 'photo' ? ['entity_id', 'picture_key'] : []),
  ];
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !allowed.includes(key)) ||
    query.get('schema_version') !== '1'
  )
    throw new AssetFailure('invalid_request');
  const value = {
    ...Object.fromEntries(query),
    schema_version: 1,
    kind: match[1] === 'photo' ? 'photo' : 'basemap',
    ...(match[1] === 'photo'
      ? {}
      : { z: Number(match[2]), x: Number(match[3]), y: Number(match[4]) }),
  };
  checked(value);
  return value as AssetRequest;
}

/** Bundled SHA-256 over UTF-8, including on ordinary HTTP without WebCrypto. */
export function pictureKey(picture: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const input = new TextEncoder().encode(picture);
  const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input);
  bytes[input.length] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
  view.setUint32(bytes.length - 4, input.length * 8);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const rotate = (value: number, count: number) =>
    (value >>> count) | (value << (32 - count));
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15],
        y = words[i - 2];
      words[i] =
        words[i - 16] +
        (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
        words[i - 7] +
        (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          constants[i] +
          words[i]) |
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => {
      state[i] = (state[i] + value) | 0;
    });
  }
  return state
    .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  milliseconds = 10000,
): Promise<T> {
  let cleanup = () => {};
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    const timer = setTimeout(
      () => reject(new AssetFailure('unavailable')),
      milliseconds,
    );
    cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, (error: unknown) =>
      reject(
        error instanceof AssetFailure ||
          (error instanceof DOMException && error.name === 'AbortError')
          ? error
          : new AssetFailure('unavailable'),
      ),
    );
  }).finally(() => cleanup());
}

export interface OpenAsset {
  readonly response: Response;
  readonly signal: AbortSignal;
  /** Call after every async decode, before publishing an image. */
  current(): boolean;
  /** Mandatory after consumption/removal; releases this connection's slot. */
  release(): void;
}

export class AssetClient {
  private info?: AssetInfo;
  private epoch = 0;
  private eventRevision = 0;
  private lifetime = new AbortController();
  private work = new AbortController();
  private unsubscribe?: Unsubscribe;
  private unlisten: () => void;
  private disposed = false;
  private starting?: Promise<AssetInfo>;
  private refreshing?: Promise<AssetInfo>;
  private active = 0;
  private listeners = new Set<(info: AssetInfo | undefined) => void>();
  constructor(private readonly ha: HaAdapter) {
    this.unlisten = ha.listen(() => {
      this.reset();
      if (ha.connected) void this.ready().catch(() => undefined);
    });
  }
  get currentInfo(): AssetInfo | undefined {
    return this.info;
  }
  observe(listener: (info: AssetInfo | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(info?: AssetInfo): void {
    if (
      info?.generation === this.info?.generation &&
      info?.entry_id === this.info?.entry_id
    )
      return;
    this.work.abort();
    this.work = new AbortController();
    this.info = info;
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch {
        /* Observers cannot own transport state. */
      }
    }
  }
  ready(): Promise<AssetInfo> {
    if (this.disposed || !this.ha.connected)
      return Promise.reject(new AssetFailure('unavailable'));
    if (this.info && this.unsubscribe) return Promise.resolve(this.info);
    if (this.starting) return this.starting;
    if (this.unsubscribe) return this.refresh();
    const epoch = this.epoch;
    this.starting = this.start(epoch).finally(() => {
      if (epoch === this.epoch) this.starting = undefined;
    });
    return this.starting;
  }
  private async start(epoch: number): Promise<AssetInfo> {
    try {
      const subscription = this.ha.subscribe(
        { type: 'aviadilo/subscribe_assets', schema_version: 1 },
        (event) => {
          if (epoch !== this.epoch || this.disposed) return;
          try {
            const envelope = event as { event_type?: unknown; data?: unknown };
            if (envelope.event_type !== ASSETS_CHANGED) return;
            const info = parseAssetInfo(envelope.data);
            this.eventRevision++;
            this.publish(info);
          } catch {
            this.reset();
          }
        },
      );
      let released = false;
      const release = (unsubscribe: Unsubscribe) => {
        if (!released) {
          released = true;
          void unsubscribe().catch(() => undefined);
        }
      };
      void subscription.then(
        (unsubscribe) => {
          if (epoch !== this.epoch) release(unsubscribe);
        },
        () => undefined,
      );
      const unsubscribe = await bounded(subscription, this.lifetime.signal);
      if (epoch !== this.epoch) {
        release(unsubscribe);
        throw abortError();
      }
      this.unsubscribe = async () => release(unsubscribe);
      return await this.refresh();
    } catch (error) {
      if (epoch === this.epoch) this.reset();
      throw error;
    }
  }
  refresh(): Promise<AssetInfo> {
    if (this.disposed || !this.ha.connected || !this.unsubscribe)
      return Promise.reject(new AssetFailure('unavailable'));
    if (this.refreshing) return this.refreshing;
    const epoch = this.epoch,
      revision = this.eventRevision;
    this.refreshing = bounded(
      this.ha.call({ type: 'aviadilo/assets_info', schema_version: 1 }),
      this.lifetime.signal,
    )
      .then((value) => {
        if (epoch !== this.epoch || this.disposed) throw abortError();
        if (revision === this.eventRevision)
          this.publish(parseAssetInfo(value));
        if (!this.info) throw new AssetFailure('unavailable');
        return this.info;
      })
      .finally(() => {
        if (epoch === this.epoch) this.refreshing = undefined;
      });
    return this.refreshing;
  }
  async open(request: AssetRequest, signal?: AbortSignal): Promise<OpenAsset> {
    const path = buildAssetPath(request);
    if (signal?.aborted) throw abortError();
    const info = await this.ready();
    if (
      signal?.aborted ||
      this.disposed ||
      !this.ha.connected ||
      this.info !== info
    )
      throw abortError();
    if (request.entry_id !== undefined && request.entry_id !== info.entry_id)
      throw new AssetFailure('not_found');
    if (request.generation !== info.generation)
      throw new AssetFailure('stale_generation');
    if (this.active >= ASSET_LIMITS.active) throw new AssetFailure('busy');
    this.active++;
    const controller = new AbortController();
    const combined = AbortSignal.any([
      controller.signal,
      this.work.signal,
      this.lifetime.signal,
      ...(signal ? [signal] : []),
    ]);
    const timer = setTimeout(() => controller.abort(), 150000);
    let response: Response | undefined,
      released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      clearTimeout(timer);
      controller.abort();
      combined.removeEventListener('abort', release);
      if (response?.body && !response.body.locked)
        void response.body.cancel().catch(() => undefined);
    };
    combined.addEventListener('abort', release, { once: true });
    try {
      const fetching = this.ha.fetch(path, combined);
      void fetching.then(
        (late) => {
          if (combined.aborted && late.body && !late.body.locked)
            void late.body.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      response = await bounded(fetching, combined, 150000);
      if (combined.aborted) throw abortError();
      if (!response.ok) {
        // HA may reject auth or a missing route before our JSON handler runs.
        if (response.status === 401) throw new AssetFailure('unauthorized');
        if (response.status === 403) throw new AssetFailure('forbidden');
        if (response.status === 404) throw new AssetFailure('not_found');
        // Error bodies are bounded before JSON decoding; upstream payloads never
        // become UI error text. A renderer must similarly bound PNG consumption.
        const body = await readError(response, combined);
        if (body.code === 'stale_generation') {
          if (body.generation === info.generation)
            throw new AssetFailure('upstream_error');
          if (response.headers.get(GENERATION_HEADER) !== body.generation)
            throw new AssetFailure('upstream_error');
          this.publish(undefined);
          await this.refresh();
        }
        throw new AssetFailure(body.code);
      }
      if (
        response.headers.get(GENERATION_HEADER) !== info.generation ||
        response.headers.get('Content-Type')?.split(';')[0] !== 'image/png'
      )
        throw new AssetFailure('upstream_error');
      return {
        response,
        signal: combined,
        current: () =>
          !combined.aborted &&
          this.info?.generation === info.generation &&
          this.info?.entry_id === info.entry_id,
        release,
      };
    } catch (error) {
      release();
      if (
        error instanceof AssetFailure ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;
      throw new AssetFailure('unavailable');
    }
  }
  private reset(): void {
    this.epoch++;
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.publish(undefined);
    this.work.abort();
    this.work = new AbortController();
    this.starting = undefined;
    this.refreshing = undefined;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    if (unsubscribe) void unsubscribe().catch(() => undefined);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.unlisten();
    this.listeners.clear();
  }
}
async function readError(
  response: Response,
  signal: AbortSignal,
): Promise<AssetErrorBody> {
  if (
    response.headers.get('Content-Type')?.split(';')[0] !==
      'application/json' ||
    !response.body
  )
    throw new AssetFailure('upstream_error');
  const reader = response.body.getReader();
  let text = '',
    size = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const chunk = await bounded(reader.read(), signal);
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2048) throw new AssetFailure('upstream_error');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return parseAssetError(
      JSON.parse(text + decoder.decode()),
      response.status,
    );
  } catch {
    if (signal.aborted) throw abortError();
    throw new AssetFailure('upstream_error');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

const connections = new WeakMap<
  object,
  {
    userId?: string;
    client: AssetClient;
    decoded: DecodedAssets;
    owners: Map<object, () => HassTransport>;
  }
>();
/** One owner per visible renderer. Last release cancels transport and forgets all
 * state. A new HA connection/user gets a different coordinator. An active owner's
 * getter supplies current hass methods; all getters must describe that connection.
 */
export function acquireAssets(current: () => HassTransport): {
  client: AssetClient;
  decoded: DecodedAssets;
  release(): void;
} {
  const connection = current().connection;
  const owner = {};
  const userId = current().user?.id;
  let shared = connections.get(connection);
  if (shared && shared.userId !== userId) {
    shared.decoded.dispose();
    shared.client.dispose();
    connections.delete(connection);
    shared = undefined;
  }
  if (!shared) {
    const owners = new Map([[owner, current]]);
    const client = new AssetClient(
      createHaAdapter(() => {
        const getter = owners.values().next().value;
        if (!getter) throw new AssetFailure('unavailable');
        return getter();
      }),
    );
    shared = { userId, client, decoded: new DecodedAssets(client), owners };
    connections.set(connection, shared);
  }
  shared.owners.set(owner, current);
  let released = false;
  return {
    client: shared.client,
    decoded: shared.decoded,
    release() {
      if (released) return;
      released = true;
      shared.owners.delete(owner);
      if (shared.owners.size === 0) {
        shared.decoded.dispose();
        shared.client.dispose();
        if (connections.get(connection) === shared)
          connections.delete(connection);
      }
    },
  };
}

export const DECODED_LIMITS = Object.freeze({
  bytes: 32 * 1024 * 1024,
  entries: 128,
});
export type AssetNeed =
  | { kind: 'basemap'; z: number; x: number; y: number; entry_id?: string }
  | {
      kind: 'photo';
      entity_id: string;
      picture_key: string;
      entry_id?: string;
    };
export interface DecodedAsset {
  readonly stale: boolean;
  readonly url: string;
  readonly signal: AbortSignal;
  current(): boolean;
  release(): void;
}
interface DecodedEntry {
  stale?: boolean;
  key: string;
  need: AssetNeed;
  controller: AbortController;
  owners: number;
  bytes: number;
  url?: string;
  image?: HTMLImageElement;
  expires: number;
  settled: boolean;
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}
/** Connection-scoped admission, coalescing and decoded-image LRU. Active images
 * count against exactly the same budget as idle entries. Consumers share the URL
 * and browser image decode; no canvas copies or per-view cache is created. */
export class DecodedAssets {
  private entries = new Map<DecodedEntry, DecodedEntry>();
  private queue: DecodedEntry[] = [];
  private active = 0;
  private bytes = 0;
  private disposed = false;
  private revision = 0;
  private pendingReady = 0;
  private capacityListeners = new Set<() => void>();
  private capacityQueued = false;
  private unobserve: () => void;
  constructor(readonly client: AssetClient) {
    this.unobserve = client.observe(() => {
      this.revision++;
      this.clear();
    });
  }
  observeCapacity(listener: () => void): () => void {
    this.capacityListeners.add(listener);
    return () => this.capacityListeners.delete(listener);
  }
  private capacity(): void {
    if (this.capacityQueued || this.disposed) return;
    this.capacityQueued = true;
    queueMicrotask(() => {
      this.capacityQueued = false;
      if (!this.disposed)
        for (const listener of this.capacityListeners) listener();
    });
  }
  diagnostics() {
    return {
      active: this.active,
      pending: this.queue.length + this.pendingReady,
      entries: this.entries.size,
      bytes: this.bytes,
      owners: [...this.entries.values()].reduce((n, e) => n + e.owners, 0),
    };
  }
  async acquire(
    need: AssetNeed,
    signal: AbortSignal,
    valid: () => boolean = () => true,
  ): Promise<DecodedAsset> {
    if (signal.aborted || this.disposed || !valid()) throw abortError();
    let info = this.client.currentInfo;
    if (!info) {
      if (this.pendingReady + this.queue.length >= ASSET_LIMITS.pending)
        throw new AssetFailure('busy', true);
      this.pendingReady++;
      try {
        info = await bounded(this.client.ready(), signal);
      } finally {
        this.pendingReady--;
        this.capacity();
      }
    }
    if (signal.aborted || this.disposed || !valid()) throw abortError();
    if (need.entry_id !== undefined && need.entry_id !== info.entry_id)
      throw new AssetFailure('not_found');
    if (need.kind === 'basemap') {
      const size = 2 ** need.z;
      need = { ...need, x: ((need.x % size) + size) % size };
    }
    const request = {
      ...need,
      schema_version: 1 as const,
      generation: info.generation,
      entry_id: info.entry_id,
    } as AssetRequest;
    const key = buildAssetPath(request);
    let entry = [...this.entries.values()]
      .reverse()
      .find(
        (item) =>
          item.key === key && (!item.settled || Date.now() < item.expires),
      );
    for (const idle of this.entries.values())
      if (!idle.owners && idle.settled && Date.now() >= idle.expires)
        this.drop(idle);
    if (!entry) {
      if (
        this.active >= ASSET_LIMITS.active &&
        this.queue.length >= ASSET_LIMITS.pending
      )
        throw new AssetFailure('busy', true);
      // Reserve the maximum normalized decode before starting transport.
      const bytes = (need.kind === 'photo' ? 128 : 256) ** 2 * 4;
      while (
        this.entries.size >= DECODED_LIMITS.entries ||
        this.bytes + bytes > DECODED_LIMITS.bytes
      ) {
        const idle = [...this.entries.values()].find(
          (item) => item.settled && !item.owners,
        );
        if (!idle) throw new AssetFailure('busy', true);
        this.drop(idle);
      }
      let resolve!: () => void, reject!: (error: unknown) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      entry = {
        key,
        need,
        controller: new AbortController(),
        owners: 0,
        bytes,
        expires: 0,
        settled: false,
        promise,
        resolve,
        reject,
      };
      this.entries.set(entry, entry);
      this.bytes += bytes;
      this.queue.push(entry);
    }
    const item = entry;
    this.entries.delete(item);
    this.entries.set(item, item);
    item.owners++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener('abort', release);
      item.owners--;
      if (!item.owners) this.capacity();
      if (
        !item.owners &&
        (!item.settled ||
          item.need.kind === 'photo' ||
          item.expires <= Date.now())
      )
        this.drop(item);
    };
    signal.addEventListener('abort', release, { once: true });
    this.pump();
    try {
      await bounded(item.promise, signal, 150000);
      if (released || item.controller.signal.aborted || !valid())
        throw abortError();
      return {
        url: item.url!,
        stale: item.stale === true,
        signal: item.controller.signal,
        current: () => !released && !item.controller.signal.aborted && valid(),
        release,
      };
    } catch (error) {
      release();
      throw error;
    }
  }
  private pump(): void {
    while (
      !this.disposed &&
      this.active < ASSET_LIMITS.active &&
      this.queue.length
    ) {
      const entry = this.queue.shift()!;
      if (entry.controller.signal.aborted) continue;
      this.active++;
      void this.load(entry)
        .then(entry.resolve, (error) => {
          entry.reject(error);
          this.drop(entry);
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
  private async load(entry: DecodedEntry): Promise<void> {
    const revision = this.revision;
    const opened = await this.client.open(
      parseAssetPath(entry.key),
      entry.controller.signal,
    );
    try {
      const bytes = await readPng(
        opened.response,
        opened.signal,
        entry.need.kind === 'photo' ? 128 : 256,
      );
      if (!opened.current() || revision !== this.revision) throw abortError();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      entry.url = url;
      const image = new Image();
      entry.image = image;
      image.src = url;
      await bounded(image.decode(), opened.signal);
      if (
        !opened.current() ||
        revision !== this.revision ||
        entry.controller.signal.aborted
      )
        throw abortError();
      if (image.naturalWidth !== 256 || image.naturalHeight !== 256) {
        if (
          entry.need.kind === 'basemap' ||
          image.naturalWidth > 128 ||
          image.naturalHeight > 128 ||
          !image.naturalWidth ||
          !image.naturalHeight
        )
          throw new AssetFailure('upstream_error');
      }
      const headers = opened.response.headers;
      entry.stale = headers.get('X-Aviadilo-Cache') === 'stale';
      const control = headers.get('Cache-Control') ?? '';
      const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(control);
      const rawAge = Number(headers.get('Age') ?? 0);
      const age = Number.isFinite(rawAge) && rawAge >= 0 ? rawAge : Infinity;
      const parsedDate = headers.has('Date')
        ? Date.parse(headers.get('Date')!)
        : Date.now();
      const dateAge = Number.isFinite(parsedDate)
        ? Math.max(0, (Date.now() - parsedDate) / 1000)
        : Infinity;
      const seconds = maxAge ? Number(maxAge[1]) - Math.max(age, dateAge) : 0;
      const freshness = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      entry.expires =
        /(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|=|$)/i.test(control) ||
        entry.need.kind === 'photo'
          ? 0
          : Date.now() + freshness * 1000;
      entry.settled = true;
    } finally {
      opened.release();
    }
  }
  private drop(entry: DecodedEntry): void {
    if (!this.entries.has(entry)) return;
    this.entries.delete(entry);
    this.bytes -= entry.bytes;
    this.capacity();
    this.queue = this.queue.filter((item) => item !== entry);
    entry.controller.abort();
    entry.reject(abortError());
    entry.image?.removeAttribute('src');
    entry.image = undefined;
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = undefined;
  }
  clear(): void {
    for (const entry of this.entries.values()) this.drop(entry);
  }
  dispose(): void {
    this.disposed = true;
    this.unobserve();
    this.capacityListeners.clear();
    this.clear();
  }
}
async function readPng(
  response: Response,
  signal: AbortSignal,
  dimension: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    !response.body ||
    Number(response.headers.get('Content-Length') ?? 0) > ASSET_LIMITS.bytes
  )
    throw new AssetFailure('upstream_error');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await bounded(reader.read(), signal);
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > ASSET_LIMITS.bytes) throw new AssetFailure('upstream_error');
      chunks.push(chunk.value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (
    size < 33 ||
    [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82].some(
      (value, index) => bytes[index] !== value,
    )
  )
    throw new AssetFailure('upstream_error');
  const view = new DataView(bytes.buffer);
  if (
    !view.getUint32(16) ||
    !view.getUint32(20) ||
    view.getUint32(16) > dimension ||
    view.getUint32(20) > dimension
  )
    throw new AssetFailure('upstream_error');
  return bytes;
}
