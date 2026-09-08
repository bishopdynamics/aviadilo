/** Asset transport v1; no image decoder, object-URL retention or pending queue.
 * Slice 3 renderers must share acquireAssets per HA connection, schedule at most
 * 128 pending visible requests, and release every opened response after decode.
 * This boundary already caps active opens at 8 and invalidates their signals on
 * generation/connection change. A 409 reconciles once; it never retries a GET.
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
  constructor(readonly code: AssetErrorBody['code']) {
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
    promise.then(resolve, () => reject(new AssetFailure('unavailable')));
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
        { type: 'subscribe_events', event_type: ASSETS_CHANGED },
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
  { client: AssetClient; owners: Map<object, () => HassTransport> }
>();
/** One owner per visible renderer. Last release cancels transport and forgets all
 * state. A new HA connection/user gets a different coordinator. An active owner's
 * getter supplies current hass methods; all getters must describe that connection.
 */
export function acquireAssets(current: () => HassTransport): {
  client: AssetClient;
  release(): void;
} {
  const connection = current().connection;
  const owner = {};
  let shared = connections.get(connection);
  if (!shared) {
    const owners = new Map([[owner, current]]);
    const client = new AssetClient(
      createHaAdapter(() => {
        const getter = owners.values().next().value;
        if (!getter) throw new AssetFailure('unavailable');
        return getter();
      }),
    );
    shared = { client, owners };
    connections.set(connection, shared);
  }
  shared.owners.set(owner, current);
  let released = false;
  return {
    client: shared.client,
    release() {
      if (released) return;
      released = true;
      shared.owners.delete(owner);
      if (shared.owners.size === 0) {
        shared.client.dispose();
        connections.delete(connection);
      }
    },
  };
}
