import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import paths from '../../../contracts/fixtures/asset-paths.json';
import {
  acquireAssets,
  ASSETS_CHANGED,
  AssetClient,
  AssetFailure,
  buildAssetPath,
  GENERATION_HEADER,
  parseAssetPath,
  pictureKey,
  retryAfter,
} from '../../../src/data/assets';
import type { AssetInfo, BasemapRequest } from '../../../src/data/asset-types';
import {
  createHaAdapter,
  type HaAdapter,
  type HassTransport,
  type Unsubscribe,
} from '../../../src/data/ha';
const generation = '0123456789abcdef0123456789abcdef:0';
const info: AssetInfo = {
  schema_version: 1,
  entry_id: 'synthetic-entry',
  generation,
};
const tile: BasemapRequest = {
  kind: 'basemap',
  schema_version: 1,
  generation,
  z: 2,
  x: 3,
  y: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
class FakeHa implements HaAdapter {
  connected = true;
  calls: ReturnType<typeof deferred<unknown>>[] = [];
  callback?: (value: unknown) => void;
  changed = () => {};
  unsub = vi.fn().mockResolvedValue(undefined);
  subscription = deferred<Unsubscribe>();
  messages: unknown[] = [];
  fetch = vi.fn<HaAdapter['fetch']>().mockImplementation(
    async () =>
      new Response('png-decoding-belongs-to-renderer', {
        headers: {
          'Content-Type': 'image/png',
          [GENERATION_HEADER]: generation,
        },
      }),
  );
  call(message: unknown) {
    this.messages.push(message);
    const pending = deferred<unknown>();
    this.calls.push(pending);
    return pending.promise;
  }
  subscribe(message: unknown, callback: (value: unknown) => void) {
    this.messages.push(message);
    this.callback = callback;
    return this.subscription.promise;
  }
  listen(changed: () => void) {
    this.changed = changed;
    return vi.fn();
  }
  event(value: AssetInfo) {
    this.callback?.({ event_type: ASSETS_CHANGED, data: value });
  }
}
async function setup() {
  const ha = new FakeHa(),
    client = new AssetClient(ha);
  const ready = client.ready();
  ha.subscription.resolve(ha.unsub);
  await flush();
  ha.calls[0].resolve(info);
  await ready;
  return { ha, client };
}
describe('paired raw asset paths', () => {
  for (const fixture of paths)
    it(fixture.name, () => {
      if (fixture.valid) {
        expect(parseAssetPath(fixture.path)).toEqual(fixture.value);
        expect(buildAssetPath(fixture.value as BasemapRequest)).toBe(
          fixture.path,
        );
      } else expect(() => parseAssetPath(fixture.path)).toThrow();
    });
  it('rejects scalar coercion, nonfinite, geometry and undeclared keys', () => {
    for (const z of [true, '2', NaN, Infinity, -1, 20])
      expect(() => buildAssetPath({ ...tile, z } as BasemapRequest)).toThrow();
    expect(() => buildAssetPath({ ...tile, x: 4 })).toThrow();
    expect(() =>
      buildAssetPath({
        ...tile,
        url: 'https://secret.invalid',
      } as BasemapRequest),
    ).toThrow();
  });
  it('uses a bundled UTF-8 SHA256 implementation without a secure context', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      for (const value of [
        '',
        'abc',
        'a'.repeat(55),
        'a'.repeat(56),
        'a'.repeat(64),
        'a'.repeat(1000),
        'https://example.invalid/é😀?q=秘密',
      ])
        expect(pictureKey(value)).toBe(
          createHash('sha256').update(value).digest('hex'),
        );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('ships validators with no runtime dynamic evaluation', async () => {
    const source = await readFile('src/config/validators.js', 'utf8');
    expect(source).not.toMatch(/\b(?:new Function|eval\s*\()/);
    expect(source).toContain('export const assets');
  });
});
it('allows exact HA resource routes and keeps radar opaque queries', async () => {
  const hass: HassTransport = {
    connection: {
      connected: true,
      subscribeMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    callWS: vi.fn(),
    fetchWithAuth: vi.fn().mockResolvedValue(new Response()),
  };
  let current = hass;
  const adapter = createHaAdapter(() => current),
    signal = new AbortController().signal;
  const radar = '/api/aviadilo/radar?frame=%2Fopaque%2F..%2F&style=x%23y';
  await adapter.fetch(radar, signal);
  expect(hass.fetchWithAuth).toHaveBeenCalledWith(radar, {
    signal,
    credentials: 'same-origin',
    redirect: 'error',
  });
  await adapter.fetch(buildAssetPath(tile), signal);
  expect(hass.fetchWithAuth).toHaveBeenLastCalledWith(buildAssetPath(tile), {
    signal,
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'origin',
  });
  for (const path of [
    '/api/aviadilo/radar-other?x=1',
    '/api/aviadilo/radar?x=1#fragment',
    '/api/aviadilo/radar?x=1\n',
    '/api/aviadilo/radar/../photo?x=1',
    '/api/aviadilo/radar?x=\\x',
    'https://ha.invalid/api/aviadilo/radar?x=1',
  ])
    expect(() => adapter.fetch(path, signal)).toThrow();
  current = { ...hass, callWS: vi.fn().mockResolvedValue(info) };
  await adapter.call({ type: 'aviadilo/assets_info' });
  expect(current.callWS).toHaveBeenCalledOnce();
  current = { ...hass, connection: { ...hass.connection } };
  expect(() => adapter.call({ type: 'aviadilo/assets_info' })).toThrow(
    'connection changed',
  );
});
it('subscribes before info and discards a superseded initial response', async () => {
  const ha = new FakeHa(),
    client = new AssetClient(ha);
  const ready = client.ready();
  expect(ha.messages).toEqual([
    { type: 'aviadilo/subscribe_assets', schema_version: 1 },
  ]);
  ha.subscription.resolve(ha.unsub);
  await flush();
  const next = { ...info, generation: generation.slice(0, -1) + '1' };
  ha.event(next);
  ha.calls[0].resolve(info);
  expect(await ready).toEqual(next);
  expect(ha.calls).toHaveLength(1);
  client.dispose();
});
it('invalidates active responses and bounds concurrent opens until released', async () => {
  const { ha, client } = await setup();
  const opened = await Promise.all(
    Array.from({ length: 8 }, () => client.open(tile)),
  );
  await expect(client.open(tile)).rejects.toMatchObject({ code: 'busy' });
  opened[0].release();
  opened[0].release();
  const replacement = await client.open(tile);
  ha.event({ ...info, generation: generation.slice(0, -1) + '1' });
  for (const item of [...opened, replacement]) {
    expect(item.signal.aborted).toBe(true);
    expect(item.current()).toBe(false);
  }
  await expect(client.open(tile)).rejects.toMatchObject({
    code: 'stale_generation',
  });
  client.dispose();
  expect(ha.unsub).toHaveBeenCalledOnce();
});
it('rejects late fetch headers after generation invalidation', async () => {
  const { ha, client } = await setup();
  const pending = deferred<Response>();
  ha.fetch.mockReturnValue(pending.promise);
  const opening = client.open(tile);
  await flush();
  ha.event({ ...info, generation: generation.slice(0, -1) + '1' });
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  pending.resolve(new Response('old'));
  client.dispose();
});
it('refreshes once on 409 without retrying the resource or adding event subscriptions', async () => {
  const { ha, client } = await setup();
  const next = { ...info, generation: generation.slice(0, -1) + '1' };
  ha.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        schema_version: 1,
        code: 'stale_generation',
        message: 'Asset generation has changed',
        generation: next.generation,
      }),
      {
        status: 409,
        headers: {
          'Content-Type': 'application/json',
          [GENERATION_HEADER]: next.generation,
        },
      },
    ),
  );
  const opening = client.open(tile);
  await flush();
  expect(ha.calls).toHaveLength(2);
  ha.calls[1].resolve(next);
  await expect(opening).rejects.toMatchObject({ code: 'stale_generation' });
  expect(client.currentInfo).toEqual(next);
  expect(ha.fetch).toHaveBeenCalledOnce();
  expect(
    ha.messages.filter(
      (x) => (x as { type: string }).type === 'aviadilo/subscribe_assets',
    ),
  ).toHaveLength(1);
  client.dispose();
});
it('reconnects with fresh generation and ignores callbacks/responses from old epochs', async () => {
  const { ha, client } = await setup();
  const oldCallback = ha.callback!;
  ha.connected = false;
  ha.changed();
  expect(client.currentInfo).toBeUndefined();
  ha.subscription = deferred<Unsubscribe>();
  ha.connected = true;
  ha.changed();
  ha.subscription.resolve(ha.unsub);
  await flush();
  oldCallback({ event_type: ASSETS_CHANGED, data: info });
  expect(client.currentInfo).toBeUndefined();
  const next = { ...info, generation: 'fedcba9876543210fedcba9876543210:0' };
  ha.calls[1].resolve(next);
  await flush();
  expect(client.currentInfo).toEqual(next);
  client.dispose();
  expect(ha.unsub).toHaveBeenCalledTimes(2);
});
it('releases a late subscription exactly once when disposed during setup', async () => {
  const ha = new FakeHa(),
    client = new AssetClient(ha),
    ready = client.ready();
  ha.subscription.resolve(ha.unsub);
  queueMicrotask(() => client.dispose());
  await expect(ready).rejects.toBeDefined();
  await flush();
  expect(ha.unsub).toHaveBeenCalledOnce();
  expect(ha.calls).toHaveLength(0);
});
it('times out abandoned setup and releases subscriptions resolving afterwards', async () => {
  vi.useFakeTimers();
  try {
    const ha = new FakeHa(),
      client = new AssetClient(ha),
      ready = client.ready();
    const rejected = expect(ready).rejects.toBeInstanceOf(AssetFailure);
    await vi.advanceTimersByTimeAsync(10001);
    await rejected;
    ha.subscription.resolve(ha.unsub);
    await flush();
    expect(ha.unsub).toHaveBeenCalledOnce();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('bounds/redacts malformed error bodies and validates success generation', async () => {
  const { ha, client } = await setup();
  for (const response of [
    new Response('secret'.repeat(1000), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }),
    new Response(
      JSON.stringify({
        schema_version: 1,
        code: 'upstream_error',
        message: 'https://secret.invalid/token',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    ),
    new Response('png', {
      headers: { 'Content-Type': 'image/png', [GENERATION_HEADER]: 'bad' },
    }),
  ]) {
    ha.fetch.mockResolvedValue(response);
    await expect(client.open(tile)).rejects.toThrow(
      /Asset source is unavailable/,
    );
  }
  client.dispose();
});
it('shares one coordinator per connection and disposes only at final owner release', async () => {
  const connection = {
    connected: true,
    subscribeMessage: vi
      .fn()
      .mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const hass: HassTransport = {
    connection,
    callWS: vi.fn().mockResolvedValue(info),
    fetchWithAuth: vi.fn(),
  };
  const a = acquireAssets(() => hass),
    b = acquireAssets(() => hass);
  expect(a.client).toBe(b.client);
  await Promise.all([a.client.ready(), b.client.ready()]);
  expect(connection.subscribeMessage).toHaveBeenCalledOnce();
  expect(hass.callWS).toHaveBeenCalledOnce();
  a.release();
  a.release();
  expect(connection.removeEventListener).not.toHaveBeenCalled();
  b.release();
  expect(connection.removeEventListener).toHaveBeenCalledTimes(3);
  const c = acquireAssets(() => hass);
  expect(c.client).not.toBe(a.client);
  c.release();
});

it('never calls a released owner getter while another card survives', async () => {
  const connection = {
    connected: true,
    subscribeMessage: vi
      .fn()
      .mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const first: HassTransport = {
    connection,
    callWS: vi.fn().mockResolvedValue(info),
    fetchWithAuth: vi.fn(),
  };
  const second: HassTransport = {
    ...first,
    callWS: vi.fn().mockResolvedValue(info),
  };
  let firstAlive = true,
    secondAlive = true;
  const a = acquireAssets(() => {
    if (!firstAlive) throw Error('first detached');
    return first;
  });
  const b = acquireAssets(() => {
    if (!secondAlive) throw Error('second detached');
    return second;
  });
  await a.client.ready();
  b.release();
  secondAlive = false;
  await expect(a.client.refresh()).resolves.toEqual(info);
  const c = acquireAssets(() => second);
  a.release();
  firstAlive = false;
  await expect(c.client.refresh()).resolves.toEqual(info);
  c.release();
});
it('does not start a GET when disposal races a resolved ready promise', async () => {
  const { ha, client } = await setup();
  const opening = client.open(tile);
  client.dispose();
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  expect(ha.fetch).not.toHaveBeenCalled();
});
it('cancels late response bodies after aborted fetch promises resolve', async () => {
  const { ha, client } = await setup();
  const pending = deferred<Response>();
  ha.fetch.mockReturnValue(pending.promise);
  const controller = new AbortController(),
    opening = client.open(tile, controller.signal);
  await flush();
  controller.abort();
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  const cancel = vi.fn();
  pending.resolve(new Response(new ReadableStream({ cancel })));
  await flush();
  expect(cancel).toHaveBeenCalledOnce();
  client.dispose();
});

it('preserves cancellation during a pending HTTP error body', async () => {
  const { ha, client } = await setup();
  const cancel = vi.fn();
  ha.fetch.mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const opening = client.open(tile);
  await flush();
  ha.event({ ...info, generation: generation.slice(0, -1) + '1' });
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancel).toHaveBeenCalledOnce();
  client.dispose();
});
it('maps HA middleware auth and missing-route responses without exposing their bodies', async () => {
  const { ha, client } = await setup();
  for (const [status, code] of [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
  ] as const) {
    ha.fetch.mockResolvedValue(
      new Response('HA middleware private details', { status }),
    );
    await expect(client.open(tile)).rejects.toMatchObject({ code });
  }
  client.dispose();
});

// Raster decoding is the browser's responsibility; the fake records lifecycle
// while real byte/header bounds, transport, scheduling and owners run unchanged.
import { afterEach, beforeEach } from 'vitest';
import { DecodedAssets, DECODED_LIMITS } from '../../../src/data/assets';
function pngResponse(
  size = 256,
  control = 'public,max-age=3600',
  extra: Record<string, string> = {},
) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, size);
  new DataView(bytes.buffer).setUint32(20, size);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      [GENERATION_HEADER]: generation,
      'Cache-Control': control,
      ...extra,
    },
  });
}
const need = { kind: 'basemap' as const, z: 8, x: 0, y: 1 };
describe('shared bounded decoded resources', () => {
  let create: ReturnType<typeof vi.spyOn>, revoke: ReturnType<typeof vi.spyOn>;
  let width = 256;
  let decode: () => Promise<void>;
  beforeEach(() => {
    width = 256;
    decode = () => Promise.resolve();
    let id = 0;
    create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:fixture-${++id}`);
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = width;
        naturalHeight = width;
        decode() {
          return decode();
        }
        removeAttribute() {
          this.src = '';
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function cache() {
    const { ha, client } = await setup();
    ha.fetch.mockImplementation(async () => pngResponse());
    return { ha, client, decoded: new DecodedAssets(client) };
  }
  it('retries a shared visible tile after429, honors Retry-After and cools fresh connection demand', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { ha, client, decoded } = await cache();
    ha.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema_version: 1,
          code: 'busy',
          message: 'Asset capacity reached',
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
        },
      ),
    );
    const a = new AbortController(),
      b = new AbortController();
    const unavailable = vi.fn();
    const first = decoded
      .acquire(need, a.signal, () => true, unavailable)
      .catch(() => null);
    const alias = decoded.acquire(need, b.signal);
    await flush();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(decoded.diagnostics()).toMatchObject({
      active: 0,
      pending: 1,
      owners: 2,
    });
    const fresh = decoded.acquire({ ...need, x: 2 }, b.signal);
    await flush();
    expect(ha.fetch).toHaveBeenCalledOnce();
    a.abort();
    await vi.advanceTimersByTimeAsync(1999);
    expect(ha.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    const [one, two] = await Promise.all([alias, fresh]);
    expect(await first).toBeNull();
    expect(ha.fetch).toHaveBeenCalledTimes(3);
    expect(one.current() && two.current()).toBe(true);
    b.abort();
    decoded.dispose();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it('recovers after a prolonged outage without holding transfer slots or exhausting visible demand', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { ha, client, decoded } = await cache();
    let failing = true;
    ha.fetch.mockImplementation(async () =>
      failing
        ? new Response('proxy unavailable', { status: 503 })
        : pngResponse(),
    );
    const controller = new AbortController();
    const pending = decoded.acquire(need, controller.signal);
    await flush();
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(decoded.diagnostics()).toMatchObject({ active: 0, pending: 1 });
      await vi.advanceTimersByTimeAsync(30000);
    }
    expect(ha.fetch.mock.calls.length).toBeGreaterThan(10);
    failing = false;
    await vi.advanceTimersByTimeAsync(30000);
    const held = await pending;
    expect(held.current()).toBe(true);
    held.release();
    decoded.dispose();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it('recovers transient fetch failures, but terminal auth and malformed PNG failures never retry', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { ha, client, decoded } = await cache();
    ha.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const signal = new AbortController().signal;
    const pending = decoded.acquire(need, signal);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    (await pending).release();
    expect(ha.fetch).toHaveBeenCalledTimes(2);
    decoded.clear();
    for (const response of [
      new Response('denied', { status: 401 }),
      new Response('missing', { status: 404 }),
      pngResponse(257),
      new Response('{invalid', {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]) {
      ha.fetch.mockResolvedValueOnce(response);
      await expect(decoded.acquire(need, signal)).rejects.toBeInstanceOf(
        AssetFailure,
      );
      const calls = ha.fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60000);
      expect(ha.fetch).toHaveBeenCalledTimes(calls);
    }
    decoded.dispose();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it.each([429, 502, 503])(
    'recovers an erroring JSON %s stream without cleanup masking retry metadata',
    async (status) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { ha, client, decoded } = await cache();
      try {
        const response = new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('connection reset'));
            },
          }),
          {
            status,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
          },
        );
        ha.fetch.mockResolvedValueOnce(response);
        const unavailable = vi.fn();
        const pending = decoded.acquire(
          need,
          new AbortController().signal,
          () => true,
          unavailable,
        );
        void pending.catch(() => undefined);
        await flush();
        await flush();
        expect(decoded.diagnostics()).toMatchObject({ active: 0, pending: 1 });
        expect(response.body!.locked).toBe(false);
        expect(unavailable).toHaveBeenCalledWith(
          expect.objectContaining({
            retryable: true,
            status,
            retryAfterMs: 2000,
          }),
        );
        await vi.advanceTimersByTimeAsync(1999);
        expect(ha.fetch).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        const held = await pending;
        expect(held.current()).toBe(true);
        expect(ha.fetch).toHaveBeenCalledTimes(2);
        held.release();
      } finally {
        decoded.dispose();
        client.dispose();
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
      }
    },
  );
  it('cancels sleeping retries and safely suspends excessively large Retry-After', async () => {
    vi.useFakeTimers();
    const { ha, client, decoded } = await cache();
    ha.fetch.mockImplementation(
      async () =>
        new Response('busy', {
          status: 429,
          headers: { 'Retry-After': '999999999999999999999999' },
        }),
    );
    const controller = new AbortController();
    const pending = decoded.acquire(need, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    expect(decoded.diagnostics()).toMatchObject({ active: 0, pending: 1 });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(ha.fetch).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    decoded.dispose();
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  function transport() {
    const unsub = vi.fn().mockResolvedValue(undefined);
    const hass: HassTransport = {
      user: { id: 'regular' },
      connection: {
        connected: true,
        subscribeMessage: vi.fn().mockResolvedValue(unsub),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      callWS: vi.fn().mockResolvedValue(info),
      fetchWithAuth: vi.fn().mockImplementation(async () => pngResponse()),
    };
    return { hass, unsub };
  }
  it('retains only decoded basemap bytes across navigation and gates adoption on a new metadata handshake', async () => {
    vi.useFakeTimers();
    const { hass, unsub } = transport();
    const a = acquireAssets(() => hass);
    const old = await a.decoded.acquire(need, new AbortController().signal);
    a.release();
    expect(old.current()).toBe(false);
    expect(unsub).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    const metadata = deferred<AssetInfo>();
    vi.mocked(hass.callWS).mockReturnValueOnce(metadata.promise);
    const b = acquireAssets(() => hass);
    const adopting = b.decoded.acquire(need, new AbortController().signal);
    await flush();
    expect(b.decoded.diagnostics().entries).toBe(0);
    expect(hass.fetchWithAuth).toHaveBeenCalledOnce();
    vi.mocked(hass.connection.subscribeMessage).mock.calls[1][0]({
      event_type: ASSETS_CHANGED,
      data: info,
    });
    const earlyEvent = b.decoded.acquire(need, new AbortController().signal);
    await flush();
    expect(b.client.currentInfo).toEqual(info);
    expect(b.decoded.diagnostics().entries).toBe(0);
    expect(hass.fetchWithAuth).toHaveBeenCalledOnce();
    metadata.resolve(info);
    const current = await adopting;
    (await earlyEvent).release();
    expect(current.url).toBe(old.url);
    expect(current.current()).toBe(true);
    expect(hass.callWS).toHaveBeenCalledTimes(2);
    expect(hass.fetchWithAuth).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    old.release();
    current.release();
    b.release();
    await vi.advanceTimersByTimeAsync(600000);
    expect(revoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it.each(['generation', 'entry', 'user', 'connection', 'expired'])(
    'discards retained data on %s mismatch or expiry',
    async (change) => {
      vi.useFakeTimers();
      const { hass } = transport();
      vi.mocked(hass.fetchWithAuth!).mockImplementation(async () =>
        pngResponse(256, 'max-age=20', { Age: '10' }),
      );
      const a = acquireAssets(() => hass);
      (await a.decoded.acquire(need, new AbortController().signal)).release();
      a.release();
      let nextInfo = info;
      if (change === 'generation')
        nextInfo = { ...info, generation: generation.slice(0, -1) + '1' };
      if (change === 'entry') nextInfo = { ...info, entry_id: 'replacement' };
      if (change === 'user') hass.user = { id: 'other-user' };
      if (change === 'connection') hass.connection = { ...hass.connection };
      if (change === 'expired') await vi.advanceTimersByTimeAsync(10001);
      vi.mocked(hass.callWS).mockResolvedValue(nextInfo);
      vi.mocked(hass.fetchWithAuth!).mockImplementation(async () =>
        pngResponse(256, 'max-age=60', {
          [GENERATION_HEADER]: nextInfo.generation,
        }),
      );
      const b = acquireAssets(() => hass);
      const held = await b.decoded.acquire(need, new AbortController().signal);
      expect(hass.fetchWithAuth).toHaveBeenCalledTimes(2);
      expect(revoke).toHaveBeenCalledOnce();
      held.release();
      b.release();
      await vi.advanceTimersByTimeAsync(600000);
      expect(revoke).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    },
  );
  it('last owner drops private photos and late decodes while idle retention stays globally bounded', async () => {
    vi.useFakeTimers();
    const { hass } = transport();
    const a = acquireAssets(() => hass);
    const signal = new AbortController().signal;
    const leases = await Promise.all(
      Array.from({ length: 128 }, (_, x) =>
        a.decoded.acquire({ ...need, x }, signal),
      ),
    );
    a.release();
    expect(vi.getTimerCount()).toBe(1);
    expect(revoke).not.toHaveBeenCalled();
    const other = transport();
    const b = acquireAssets(() => other.hass);
    expect(revoke).toHaveBeenCalledTimes(128);
    width = 128;
    vi.mocked(other.hass.fetchWithAuth!).mockImplementation(async () =>
      pngResponse(128, 'no-store'),
    );
    const photo = await b.decoded.acquire(
      {
        kind: 'photo',
        entity_id: 'person.synthetic',
        picture_key: pictureKey('photo'),
      },
      signal,
    );
    b.release();
    expect(photo.current()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(129);
    leases.forEach((held) => held.release());
    photo.release();
    width = 256;
    const c = acquireAssets(() => hass);
    const late = deferred<void>();
    decode = () => late.promise;
    const pending = c.decoded.acquire(need, signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    c.release();
    await rejected;
    late.resolve();
    await flush();
    expect(c.decoded.diagnostics()).toMatchObject({
      active: 0,
      entries: 0,
      bytes: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    vi.useRealTimers();
  });
  it('last-owner release cancels a retry timer and new ownership starts with clean counters', async () => {
    vi.useFakeTimers();
    const { hass, unsub } = transport();
    vi.mocked(hass.fetchWithAuth).mockImplementation(
      async () =>
        new Response('busy', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    const a = acquireAssets(() => hass);
    const pending = a.decoded.acquire(need, new AbortController().signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    await flush();
    expect(a.decoded.diagnostics()).toMatchObject({ active: 0, pending: 1 });
    expect(vi.getTimerCount()).toBe(1);
    a.release();
    await rejected;
    await flush();
    expect(unsub).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(hass.fetchWithAuth).mockImplementation(async () => pngResponse());
    const b = acquireAssets(() => hass);
    const held = await b.decoded.acquire(need, new AbortController().signal);
    expect(b.decoded.diagnostics()).toMatchObject({
      active: 0,
      pending: 0,
      entries: 1,
    });
    expect(hass.fetchWithAuth).toHaveBeenCalledTimes(2);
    held.release();
    b.release();
    await vi.advanceTimersByTimeAsync(600000);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it('carries stale response metadata across shared decoded leases without extra requests', async () => {
    const { ha, client, decoded } = await cache();
    ha.fetch.mockImplementation(async () =>
      pngResponse(256, 'public,max-age=3600', { 'X-Aviadilo-Cache': 'stale' }),
    );
    const signal = new AbortController().signal;
    const a = await decoded.acquire(need, signal);
    const b = await decoded.acquire(need, signal);
    expect(a.stale).toBe(true);
    expect(b.stale).toBe(true);
    expect(ha.fetch).toHaveBeenCalledOnce();
    a.release();
    b.release();
    decoded.clear();
    ha.fetch.mockImplementation(async () => pngResponse());
    const current = await decoded.acquire(need, signal);
    expect(current.stale).toBe(false);
    current.release();
    decoded.dispose();
    client.dispose();
  });
  it('bounds waiting owners before HA metadata exists and cancels their admission', async () => {
    const ha = new FakeHa(),
      client = new AssetClient(ha),
      decoded = new DecodedAssets(client);
    const controller = new AbortController();
    const requests = Array.from({ length: 128 }, (_, x) =>
      decoded.acquire({ ...need, x }, controller.signal).catch(() => null),
    );
    await expect(
      decoded.acquire({ ...need, x: 129 }, controller.signal),
    ).rejects.toMatchObject({ code: 'busy', localCapacity: true });
    expect(decoded.diagnostics().pending).toBe(128);
    expect(ha.fetch).not.toHaveBeenCalled();
    controller.abort();
    await Promise.all(requests);
    expect(decoded.diagnostics()).toMatchObject({
      pending: 0,
      active: 0,
      entries: 0,
    });
    decoded.dispose();
    client.dispose();
  });
  it('coalesces wrapped aliases, charges active images and revokes every resource on clear', async () => {
    const { ha, client, decoded } = await cache();
    const controller = new AbortController();
    const [a, b] = await Promise.all([
      decoded.acquire(need, controller.signal),
      decoded.acquire({ ...need, x: 256 }, controller.signal),
    ]);
    expect(a.url).toBe(b.url);
    expect(ha.fetch).toHaveBeenCalledOnce();
    expect(decoded.diagnostics()).toMatchObject({
      entries: 1,
      owners: 2,
      bytes: 256 * 256 * 4,
      active: 0,
    });
    a.release();
    expect(b.current()).toBe(true);
    ha.event({ ...info, generation: generation.slice(0, -1) + '1' });
    expect(b.current()).toBe(false);
    expect(b.signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledOnce();
    expect(decoded.diagnostics().bytes).toBe(0);
    b.release();
    decoded.dispose();
    client.dispose();
  });
  it('starts eight immediately, cancels obsolete queued work and fills released slots without pacing timers', async () => {
    const { ha, client, decoded } = await cache();
    const responses: ReturnType<typeof deferred<Response>>[] = [];
    ha.fetch.mockImplementation(() => {
      const d = deferred<Response>();
      responses.push(d);
      return d.promise;
    });
    const controllers = Array.from({ length: 10 }, () => new AbortController());
    const promises = controllers.map((c, x) =>
      decoded.acquire({ ...need, x }, c.signal).catch(() => null),
    );
    await flush();
    expect(ha.fetch).toHaveBeenCalledTimes(8);
    expect(decoded.diagnostics()).toMatchObject({ active: 8, pending: 2 });
    controllers[8].abort();
    responses[0].resolve(pngResponse());
    await promises[0];
    await flush();
    expect(ha.fetch).toHaveBeenCalledTimes(9);
    expect(ha.fetch.mock.calls.map(([path]) => path)).not.toContain(
      expect.stringContaining('/8/8/1'),
    );
    controllers.forEach((c) => c.abort());
    await Promise.all(promises);
    responses.forEach((r) => r.resolve(pngResponse()));
    await flush();
    expect(decoded.diagnostics()).toMatchObject({
      active: 0,
      pending: 0,
      entries: 1,
      bytes: 262144,
      owners: 0,
    });
    decoded.dispose();
    client.dispose();
  });
  it('retains old active references while a new owner revalidates expired or no-cache data', async () => {
    for (const [control, extra] of [
      ['no-store', {}],
      ['no-cache,max-age=3600', {}],
      ['max-age=0', {}],
      ['max-age=20', { Age: '21' }],
      ['max-age=3600', { Date: 'bad-date' }],
      ['max-age=3600', { Age: 'bad-age' }],
    ] as [string, Record<string, string>][]) {
      const { ha, client, decoded } = await cache();
      ha.fetch.mockImplementation(async () => pngResponse(256, control, extra));
      const signal = new AbortController().signal;
      const a = await decoded.acquire(need, signal),
        b = await decoded.acquire(need, signal);
      expect(ha.fetch).toHaveBeenCalledTimes(2);
      expect(a.current()).toBe(true);
      expect(a.url).not.toBe(b.url);
      expect(decoded.diagnostics().entries).toBe(2);
      a.release();
      b.release();
      expect(decoded.diagnostics().bytes).toBe(0);
      decoded.dispose();
      client.dispose();
    }
  });
  it('enforces combined active admission then evicts idle LRU for capacity recovery', async () => {
    const { ha, client, decoded } = await cache();
    const signal = new AbortController().signal;
    const held = await Promise.all(
      Array.from({ length: 128 }, (_, x) =>
        decoded.acquire({ ...need, x }, signal),
      ),
    );
    expect(decoded.diagnostics()).toMatchObject({
      entries: 128,
      bytes: DECODED_LIMITS.bytes,
      pending: 0,
    });
    await expect(
      decoded.acquire({ ...need, x: 129 }, signal),
    ).rejects.toMatchObject({ code: 'busy' });
    held[0].release();
    const next = await decoded.acquire({ ...need, x: 129 }, signal);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(decoded.diagnostics().bytes).toBe(DECODED_LIMITS.bytes);
    expect(ha.fetch).toHaveBeenCalledTimes(129);
    held.forEach((a) => a.release());
    next.release();
    decoded.dispose();
    client.dispose();
    expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
  });
  it.each(['device_tracker.synthetic', 'person.synthetic'])(
    'external %s photos reauthorize on revisit, validate current entity and have a 128px decode bound',
    async (entityId) => {
      const { ha, client, decoded } = await cache();
      width = 128;
      ha.fetch.mockImplementation(async () => pngResponse(128, 'no-store'));
      const signal = new AbortController().signal;
      const photo = {
        kind: 'photo' as const,
        entity_id: entityId,
        picture_key: pictureKey('https://example.invalid/photo'),
      };
      let valid = true;
      const a = await decoded.acquire(photo, signal, () => valid);
      expect(decoded.diagnostics().bytes).toBe(128 * 128 * 4);
      a.release();
      expect(decoded.diagnostics().bytes).toBe(0);
      const b = await decoded.acquire(photo, signal, () => valid);
      expect(ha.fetch).toHaveBeenCalledTimes(2);
      valid = false;
      expect(b.current()).toBe(false);
      b.release();
      await expect(
        decoded.acquire(photo, signal, () => valid),
      ).rejects.toMatchObject({ name: 'AbortError' });
      width = 256;
      ha.fetch.mockImplementation(async () => pngResponse(256));
      await expect(decoded.acquire(photo, signal)).rejects.toMatchObject({
        code: 'upstream_error',
      });
      decoded.dispose();
      client.dispose();
    },
  );
  it('aborts late decode and oversized bodies without publishing or retaining buffers', async () => {
    const { ha, client, decoded } = await cache();
    const pending = deferred<void>();
    decode = () => pending.promise;
    const controller = new AbortController();
    const acquiring = decoded.acquire(need, controller.signal);
    await flush();
    controller.abort();
    await expect(acquiring).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve();
    await flush();
    expect(revoke).toHaveBeenCalledOnce();
    expect(decoded.diagnostics()).toMatchObject({
      active: 0,
      entries: 0,
      bytes: 0,
    });
    ha.fetch.mockImplementation(async () =>
      pngResponse(256, 'max-age=3600', { 'Content-Length': '2097153' }),
    );
    await expect(
      decoded.acquire(need, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'upstream_error' });
    decoded.dispose();
    client.dispose();
  });
});

it('surfaces denied subscription without reading info, fetching or falling back to raw events', async () => {
  const ha = new FakeHa(),
    client = new AssetClient(ha);
  const ready = client.ready();
  const denied = new Error('Asset subscription denied');
  ha.subscription.reject(denied);
  await expect(ready).rejects.toMatchObject({ code: 'unavailable' });
  expect(ha.messages).toEqual([
    { type: 'aviadilo/subscribe_assets', schema_version: 1 },
  ]);
  expect(ha.calls).toHaveLength(0);
  expect(ha.fetch).not.toHaveBeenCalled();
  expect(client.currentInfo).toBeUndefined();
  client.dispose();
});

it('keeps a clear event that races foreground refresh without adding a subscription', async () => {
  const { ha, client } = await setup();
  const refreshed = client.refresh();
  const next = { ...info, generation: generation.slice(0, -1) + '1' };
  ha.event(next);
  ha.calls[1].resolve(info);
  expect(await refreshed).toEqual(next);
  expect(client.currentInfo).toEqual(next);
  expect(
    ha.messages.filter(
      (message) =>
        (message as { type: string }).type === 'aviadilo/subscribe_assets',
    ),
  ).toEqual([{ type: 'aviadilo/subscribe_assets', schema_version: 1 }]);
  expect(ha.fetch).not.toHaveBeenCalled();
  client.dispose();
});

it('parses Retry-After defensively without early or overflowing retries', () => {
  const now = Date.parse('Wed, 09 Sep 2026 12:00:00 GMT');
  expect(retryAfter('2', now)).toBe(2000);
  expect(retryAfter('Wed, 09 Sep 2026 12:00:05 GMT', now)).toBe(5000);
  expect(retryAfter('Wed, 09 Sep 2026 11:00:00 GMT', now)).toBe(0);
  for (const value of [null, '', '-1', '1.5', 'nope', 'NaN', 'Infinity'])
    expect(retryAfter(value, now)).toBe(0);
  expect(retryAfter('999999999999999999999999', now)).toBe(Infinity);
});
