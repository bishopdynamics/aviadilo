import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cases from '../../../contracts/fixtures/cases.json';
import {
  AviadiloClient,
  parseEvent,
  parseInfo,
  type Selection,
} from '../../../src/data/client';
import {
  createHaAdapter,
  type HaAdapter,
  type HassTransport,
  type Unsubscribe,
  type WireMessage,
} from '../../../src/data/ha';

function fixture(name: string): Record<string, unknown> {
  return structuredClone(
    cases.find((item) => item.name === name)!.value,
  ) as Record<string, unknown>;
}
function selection(): Selection {
  const command = fixture('subscribe');
  return {
    entry_id: 'entry',
    layers: command.layers,
    viewport: command.viewport,
    radar_provider: 'rainviewer',
  } as Selection;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class FakeHa implements HaAdapter {
  connected = true;
  messages: WireMessage[] = [];
  listeners = new Set<() => void>();
  subscriptions: {
    message: WireMessage;
    event: (value: unknown) => void;
    resolve: (value: Unsubscribe) => void;
    promise: Promise<Unsubscribe>;
    unsub: ReturnType<typeof vi.fn<Unsubscribe>>;
  }[] = [];
  callHook?: (message: WireMessage) => Promise<unknown>;
  fetch = vi.fn<(path: string, signal: AbortSignal) => Promise<Response>>();
  call = (message: WireMessage): Promise<unknown> => {
    this.messages.push(message);
    if (this.callHook) return this.callHook(message);
    if (message.type === 'aviadilo/info')
      return Promise.resolve({
        ...fixture('info-response'),
        entry_id: 'entry',
      });
    return Promise.resolve(null);
  };
  subscribe = (
    message: WireMessage,
    event: (value: unknown) => void,
  ): Promise<Unsubscribe> => {
    const request = deferred<Unsubscribe>();
    const unsub = vi.fn().mockResolvedValue(undefined);
    this.subscriptions.push({ message, event, ...request, unsub });
    return request.promise;
  };
  listen = (changed: () => void) => {
    this.listeners.add(changed);
    return () => {
      this.listeners.delete(changed);
    };
  };
  change(connected: boolean) {
    this.connected = connected;
    this.listeners.forEach((listener) => listener());
  }
  ready(index = 0, id = 42) {
    const sub = this.subscriptions[index];
    sub.resolve(sub.unsub);
    sub.event({
      ...fixture('status'),
      subscription_id: id,
      revision: sub.message.revision,
    });
  }
  event(value: Record<string, unknown>, index = 0, revision?: number) {
    const sub = this.subscriptions[index];
    sub.event({
      ...value,
      subscription_id: 42,
      revision: revision ?? sub.message.revision,
    });
  }
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function png(size = 256): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(40);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, size);
  view.setUint32(20, size);
  return bytes;
}
const clients: AviadiloClient[] = [];
function client(ha: FakeHa, selected = selection(), event = vi.fn()) {
  const instance = new AviadiloClient(ha, selected, { event });
  clients.push(instance);
  return instance;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    () => `blob:${Math.random()}`,
  );
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  clients.splice(0).forEach((item) => item.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('actual frontend parsers consume the frozen corpus', () => {
  for (const item of cases.filter((item) =>
    ['event', 'info'].includes(item.schema),
  )) {
    it(item.name, () => {
      const parse = item.schema === 'info' ? parseInfo : parseEvent;
      if (item.valid) expect(parse(item.value)).toEqual(item.value);
      else expect(() => parse(item.value)).toThrow();
    });
  }
});

it('learns HA subscription ID during a pending handshake edit and debounces the latest revision', async () => {
  const ha = new FakeHa();
  const events = vi.fn();
  const api = client(ha, selection(), events);
  await flush();
  api.setSelection({ ...selection(), radar_provider: 'noaa_mrms' });
  api.setSelection({ ...selection(), radar_provider: 'noaa_ksox' });
  await vi.advanceTimersByTimeAsync(300);
  expect(
    ha.messages.filter((item) => item.type.includes('update')),
  ).toHaveLength(0);
  ha.ready();
  await flush();
  expect(api.subscriptionId).toBe(42);
  const update = ha.messages.find((item) => item.type.includes('update'))!;
  expect(update).toMatchObject({
    subscription_id: 42,
    revision: 2,
    radar_provider: 'noaa_ksox',
  });
  expect(events).not.toHaveBeenCalled();
  ha.event(fixture('aircraft-zero-and-unknown'), 0, 0);
  expect(events).not.toHaveBeenCalled();
  ha.event(fixture('aircraft-zero-and-unknown'), 0, 2);
  expect(events).toHaveBeenCalledTimes(1);
});

it('does not flush an edit before its 300ms debounce even if handshake completes', async () => {
  const ha = new FakeHa();
  const api = client(ha);
  await flush();
  api.setSelection({ ...selection(), radar_provider: 'noaa_mrms' });
  ha.ready();
  await flush();
  await vi.advanceTimersByTimeAsync(299);
  expect(
    ha.messages.filter((item) => item.type.includes('update')),
  ).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(
    ha.messages.filter((item) => item.type.includes('update')),
  ).toHaveLength(1);
});

it('cleans pending subscriptions on hide/dispose and ignores stale callbacks after reconnect', async () => {
  const ha = new FakeHa();
  const events = vi.fn();
  const api = client(ha, selection(), events);
  await flush();
  api.setVisible(false);
  ha.ready();
  await flush();
  expect(ha.subscriptions[0].unsub).toHaveBeenCalledOnce();
  expect(events).not.toHaveBeenCalled();
  api.setSelection({ ...selection(), radar_provider: 'noaa_ksox' });
  api.setVisible(true);
  await flush();
  expect(ha.subscriptions[1].message.radar_provider).toBe('noaa_ksox');
  ha.ready(1);
  await flush();
  ha.change(false);
  ha.change(true);
  await flush();
  ha.event(fixture('aircraft-zero-and-unknown'), 1);
  expect(events).toHaveBeenCalledTimes(1); // Only the second subscription's initial status.
  api.dispose();
  ha.ready(2);
  await flush();
  expect(ha.subscriptions[2].unsub).toHaveBeenCalledOnce();
  expect(ha.listeners.size).toBe(0);
});

it('heartbeats every 20 seconds and reconnects when a heartbeat is missed', async () => {
  const ha = new FakeHa();
  const api = client(ha);
  await flush();
  ha.ready();
  await flush();
  await vi.advanceTimersByTimeAsync(20000);
  expect(ha.messages.at(-1)?.type).toBe('aviadilo/heartbeat');
  ha.callHook = () => new Promise(() => undefined);
  await vi.advanceTimersByTimeAsync(25000);
  expect(api.state).toBe('unavailable');
  expect(ha.subscriptions[0].unsub).toHaveBeenCalledOnce();
  api.setVisible(false);
  const count = ha.messages.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(ha.messages).toHaveLength(count);
});

it('handles server unload and absent integration with bounded retries', async () => {
  const ha = new FakeHa();
  const api = client(ha);
  await flush();
  ha.ready();
  await flush();
  ha.event({
    ...fixture('status'),
    statuses: [
      {
        layer: 'aircraft',
        provider: 'adsb_fi',
        state: 'unavailable',
        last_success: null,
        effective_interval_s: null,
        message: 'aviadilo:closed',
      },
    ],
  });
  expect(api.state).toBe('unavailable');
  ha.callHook = () =>
    Promise.resolve({ ...fixture('info-response'), entry_id: null });
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.state).toBe('unavailable');
  expect(ha.subscriptions).toHaveLength(1);
});

it('times out a missing initial event and cleans up a late subscribe resolution', async () => {
  const ha = new FakeHa();
  const api = client(ha);
  await flush();
  await vi.advanceTimersByTimeAsync(10000);
  expect(api.state).toBe('unavailable');
  ha.ready();
  await flush();
  expect(ha.subscriptions[0].unsub).toHaveBeenCalledOnce();
});

it('rejects incompatible events and validation failures without rendering them', async () => {
  const ha = new FakeHa();
  const events = vi.fn();
  const api = client(ha, selection(), events);
  await flush();
  ha.ready();
  await flush();
  events.mockClear();
  ha.event({ ...fixture('radar'), schema_version: 2 });
  expect(api.state).toBe('unavailable');
  expect(events).not.toHaveBeenCalled();
});

it('fetches opaque frames using authenticated query values, coalesces and revokes images', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  const frame = '../opaque/%2F?x=1&雪';
  ha.event({
    ...fixture('radar'),
    frames: [{ id: frame, time: '2026-09-06T12:00:00Z' }],
  });
  ha.fetch.mockImplementation(
    async () =>
      new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  const tile = { product: 'radar', frame, z: 0, x: 0, y: 0 };
  const [a, b] = await Promise.all([api.loadTile(tile), api.loadTile(tile)]);
  expect(a).toBe(b);
  expect(ha.fetch).toHaveBeenCalledOnce();
  const url = new URL(ha.fetch.mock.calls[0][0], 'https://ha.test');
  expect(url.pathname).toBe('/api/aviadilo/radar');
  expect(url.searchParams.get('frame')).toBe(frame);
  expect(url.searchParams.get('subscription_id')).toBe('42');
  expect(url.searchParams.has('access_token')).toBe(false);
  api.setVisible(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(a);
});

it('aborts a stale image and ignores late response after viewport changes', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event(fixture('radar'));
  const response = deferred<Response>();
  ha.fetch.mockReturnValue(response.promise);
  const request = api.loadTile({
    product: 'radar',
    frame: 'opaque/frame-01',
    z: 0,
    x: 0,
    y: 0,
  });
  const rejection = expect(request).rejects.toThrow();
  api.setSelection({
    ...selected,
    viewport: { ...selected.viewport, zoom: 9 },
  });
  expect(ha.fetch.mock.calls[0][1].aborted).toBe(true);
  response.resolve(
    new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  await rejection;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('bounds decoded frame storage to three frames and releases oldest URLs', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event({
    ...fixture('radar'),
    frames: [0, 1, 2, 3].map((id) => ({
      id: String(id),
      time: '2026-09-06T12:00:00Z',
    })),
  });
  ha.fetch.mockImplementation(
    async () =>
      new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  const urls = [];
  for (let id = 0; id < 4; id++)
    urls.push(
      await api.loadTile({
        product: 'radar',
        frame: String(id),
        z: 0,
        x: 0,
        y: 0,
      }),
    );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[0]);
  api.dispose();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
});

it('isolates the actual HA API shapes and opts out of automatic resubscribe', async () => {
  const unsubscribe = vi.fn().mockResolvedValue(undefined);
  const hass: HassTransport = {
    connection: {
      connected: true,
      subscribeMessage: vi.fn().mockResolvedValue(unsubscribe),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    callWS: vi.fn().mockResolvedValue(null),
    fetchWithAuth: vi.fn().mockResolvedValue(new Response()),
  };
  const adapter = createHaAdapter(hass);
  const callback = vi.fn();
  expect(
    await adapter.subscribe({ type: 'aviadilo/subscribe' }, callback),
  ).toBe(unsubscribe);
  expect(hass.connection.subscribeMessage).toHaveBeenCalledWith(
    callback,
    { type: 'aviadilo/subscribe' },
    { resubscribe: false },
  );
  const signal = new AbortController().signal;
  await adapter.fetch('/api/aviadilo/radar?frame=opaque', signal);
  expect(hass.fetchWithAuth).toHaveBeenCalledWith(
    '/api/aviadilo/radar?frame=opaque',
    { signal, credentials: 'same-origin', redirect: 'error' },
  );
  expect(() => adapter.fetch('https://evil.test', signal)).toThrow();
});

it('unsubscribes when hide microtask occurs between subscribe resolution and await continuation', async () => {
  const ha = new FakeHa();
  const api = client(ha);
  await flush();
  const sub = ha.subscriptions[0];
  sub.resolve(sub.unsub);
  queueMicrotask(() => api.setVisible(false));
  await flush();
  expect(sub.unsub).toHaveBeenCalledOnce();
});

it('bounds a stuck tile body and cancels its reader', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event(fixture('radar'));
  const cancel = vi.fn();
  ha.fetch.mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Type': 'image/png' },
    }),
  );
  const request = api.loadTile({
    product: 'radar',
    frame: 'opaque/frame-01',
    z: 0,
    x: 0,
    y: 0,
  });
  const rejection = expect(request).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(150000);
  await rejection;
  expect(cancel).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('cancels one tile waiter without aborting another coalesced consumer', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event(fixture('radar'));
  const gate = deferred<Response>();
  ha.fetch.mockReturnValue(gate.promise);
  const tile = { product: 'radar', frame: 'opaque/frame-01', z: 0, x: 0, y: 0 };
  const abortA = new AbortController(),
    abortB = new AbortController();
  const a = api.loadTile(tile, abortA.signal),
    b = api.loadTile(tile, abortB.signal);
  const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  abortA.abort();
  await rejected;
  expect(ha.fetch).toHaveBeenCalledOnce();
  expect(ha.fetch.mock.calls[0][1].aborted).toBe(false);
  gate.resolve(
    new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  expect(await b).toMatch(/^blob:/);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('aborts final tile waiter, allows same-key replacement and ignores late old result', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event(fixture('radar'));
  const old = deferred<Response>(),
    fresh = deferred<Response>();
  ha.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const tile = { product: 'radar', frame: 'opaque/frame-01', z: 0, x: 0, y: 0 };
  const abort = new AbortController();
  const a = api.loadTile(tile, abort.signal);
  const rejection = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort();
  await rejection;
  expect(ha.fetch.mock.calls[0][1].aborted).toBe(true);
  const b = api.loadTile(tile);
  await flush();
  expect(ha.fetch).toHaveBeenCalledTimes(2);
  old.resolve(
    new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  await flush();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  fresh.resolve(
    new Response(png(), { headers: { 'Content-Type': 'image/png' } }),
  );
  expect(await b).toMatch(/^blob:/);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('preserves a same-key replacement started synchronously by an abort listener', async () => {
  const ha = new FakeHa();
  const selected = selection();
  selected.layers.radar = true;
  const api = client(ha, selected);
  await flush();
  ha.ready();
  await flush();
  ha.event(fixture('radar'));
  const tile = { product: 'radar', frame: 'opaque/frame-01', z: 0, x: 0, y: 0 };
  const first = new AbortController(),
    second = new AbortController();
  let replacement: Promise<string> | undefined;
  ha.fetch
    .mockImplementationOnce((_path, signal) => {
      signal.addEventListener('abort', () => {
        replacement = api.loadTile(tile, second.signal);
      });
      return new Promise<Response>(() => undefined);
    })
    .mockImplementationOnce(() => new Promise<Response>(() => undefined));
  const initial = api.loadTile(tile, first.signal);
  const rejected = expect(initial).rejects.toMatchObject({
    name: 'AbortError',
  });
  first.abort();
  await rejected;
  await flush();
  expect(ha.fetch).toHaveBeenCalledTimes(2);
  expect(replacement).toBeDefined();
  const secondRejected = expect(replacement!).rejects.toMatchObject({
    name: 'AbortError',
  });
  second.abort();
  await secondRejected;
  expect(ha.fetch.mock.calls[1][1].aborted).toBe(true);
});
