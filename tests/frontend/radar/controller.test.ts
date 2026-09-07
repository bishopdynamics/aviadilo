import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RadarController,
  viewportTiles,
  type RadarManifest,
  type TileClient,
} from '../../../src/layers/radar/controller';
import type { RadarTile } from '../../../src/data/client';
import type { Viewport } from '../../../src/data/types';
import colors from '../../../src/layers/radar/rainviewer-colors.json';

const viewport: Viewport = {
  south: 33.8,
  north: 34.2,
  west: -118,
  east: -117.5,
  zoom: 7,
};
function manifest(
  provider: RadarManifest['provider'] = 'rainviewer',
): RadarManifest {
  return {
    schema_version: 1,
    kind: 'radar-manifest',
    subscription_id: 1,
    revision: 0,
    provider,
    product: provider === 'rainviewer' ? 'radar' : 'conus_bref_qcd',
    generated_at: '2026-09-07T12:00:00Z',
    native_max_zoom: 7,
    attribution: 'Source',
    coverage: null,
    frames: Array.from({ length: 6 }, (_, i) => ({
      id: `opaque-${i}`,
      time: `2026-09-07T11:${String(i * 10).padStart(2, '0')}:00Z`,
    })),
  };
}
async function flush() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
class Client implements TileClient {
  sequence = 0;
  loadTile = vi.fn(async (tile: RadarTile, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error('aborted');
    return `blob:${tile.frame}/${tile.z}/${tile.x}/${tile.y}/${this.sequence++}`;
  });
  releaseTile = vi.fn();
}
const instances: RadarController[] = [];
function setup(config = {}, decode = async () => ({}) as CanvasImageSource) {
  const client = new Client();
  const controller = new RadarController(client, { decode });
  instances.push(controller);
  controller.configure(config);
  controller.setViewport(viewport);
  controller.receive(manifest());
  return { client, controller };
}
afterEach(() => {
  for (const c of instances) c.dispose();
  instances.length = 0;
  vi.useRealTimers();
});

describe('radar controller', () => {
  it('defaults RainViewer, displays latest first and replays without tile churn', async () => {
    const { client, controller } = setup();
    await flush();
    expect(controller.view().config.provider).toBe('rainviewer');
    expect(controller.view().displayedTime).toBe(
      manifest().frames.at(-1)!.time,
    );
    expect(
      client.loadTile.mock.calls.every(([t]) => t.frame === 'opaque-5'),
    ).toBe(true);
    const count = client.loadTile.mock.calls.length;
    controller.receive(manifest());
    await flush();
    controller.configure({
      opacity: 0.2,
      frame_duration_ms: 1200,
      show_coverage: false,
    });
    await flush();
    expect(client.loadTile).toHaveBeenCalledTimes(count);
    expect(controller.view().state).toBe('current');
  });
  it('prunes a paused excluded frame when history shrinks', async () => {
    const { client, controller } = setup();
    await flush();
    controller.seek(0);
    await flush();
    expect(controller.view().displayedTime).toBe(manifest().frames[0].time);
    controller.configure({ history_minutes: 1 });
    await flush();
    expect(controller.view().frames).toHaveLength(1);
    expect(controller.view().displayedTime).toBe(
      manifest().frames.at(-1)!.time,
    );
    expect(controller.view().bufferedFrames).toBe(1);
    expect(client.releaseTile).toHaveBeenCalled();
  });
  it('preserves manual frame across manifest refresh until Latest is selected', async () => {
    const { client, controller } = setup();
    await flush();
    controller.seek(1);
    await flush();
    const selected = controller.view().displayedTime;
    const count = client.loadTile.mock.calls.length;
    controller.receive({ ...manifest(), generated_at: '2026-09-07T12:05:00Z' });
    await flush();
    expect(controller.view().displayedTime).toBe(selected);
    expect(controller.view().index).toBe(1);
    expect(client.loadTile).toHaveBeenCalledTimes(count);
    controller.latest();
    await flush();
    expect(controller.view().displayedTime).toBe(
      manifest().frames.at(-1)!.time,
    );
  });
  it('uses native tiles for local overzoom and coarsens huge viewports', () => {
    const native = viewportTiles({ ...viewport, zoom: 18 }, manifest());
    expect(native.every((t) => t.z === 7)).toBe(true);
    const huge = viewportTiles(
      { south: -85, north: 85, west: -180, east: 180, zoom: 18 },
      manifest(),
    );
    expect(huge.length).toBeLessThanOrEqual(32);
    expect(huge.every((t) => t.z < 7)).toBe(true);
  });
  it('wraps antimeridian without globe preloading and clips envelope', () => {
    const tiles = viewportTiles(
      { south: 0, north: 1, west: 179, east: -179, zoom: 7 },
      manifest(),
    );
    expect(tiles.length).toBeLessThanOrEqual(4);
    expect(tiles.every((t) => t.x === 0 || t.x === 127)).toBe(true);
    const m = manifest();
    m.coverage = {
      bounds: { ...viewport, west: 20, east: 21 },
      description: 'envelope',
    };
    expect(viewportTiles(viewport, m)).toEqual([]);
  });
  it('keeps failed candidate explicitly stale without replacing prior imagery', async () => {
    const { client, controller } = setup();
    await flush();
    const old = controller.view().displayedTime;
    client.loadTile.mockRejectedValueOnce(new Error('provider missing'));
    controller.seek(0);
    await flush();
    expect(controller.view().state).toBe('stale');
    expect(controller.view().displayedTime).toBe(old);
    expect(controller.view().message).toContain('Showing the previous frame');
  });
  it('cancels a removed frame during decode and never publishes it', async () => {
    const gate = deferred<CanvasImageSource>();
    let first = true;
    const { client, controller } = setup({}, async () => {
      if (first) {
        first = false;
        return gate.promise;
      }
      return {} as CanvasImageSource;
    });
    await flush();
    const revised = manifest();
    revised.frames.pop();
    controller.receive(revised);
    await flush();
    gate.resolve({} as CanvasImageSource);
    await flush();
    expect(controller.view().displayedTime).toBe(revised.frames.at(-1)!.time);
    expect(
      controller.view().images.every((i) => i.tile.frame === 'opaque-4'),
    ).toBe(true);
    expect(
      client.releaseTile.mock.calls.some(([url]) => url.includes('opaque-5')),
    ).toBe(true);
  });
  it('source switching aborts pending requests and ignores late response', async () => {
    const gate = deferred<CanvasImageSource>();
    const { client, controller } = setup({}, async () => gate.promise);
    await flush();
    const signal = client.loadTile.mock.calls[0][1]!;
    controller.configure({ provider: 'noaa_mrms' });
    expect(signal.aborted).toBe(true);
    gate.resolve({} as CanvasImageSource);
    await flush();
    expect(controller.view().images).toHaveLength(0);
    controller.receive(manifest('noaa_mrms'));
    await flush();
    expect(controller.view().manifest?.provider).toBe('noaa_mrms');
  });
  it('waits for a slow adjacent preload instead of aborting and downloading again', async () => {
    vi.useFakeTimers();
    const { client, controller } = setup({
      mode: 'loop',
      frame_duration_ms: 800,
    });
    const gate = deferred<string>();
    const normal = client.loadTile.getMockImplementation()!;
    client.loadTile.mockImplementation(async (t, s) =>
      t.frame === 'opaque-0' ? gate.promise : normal(t, s),
    );
    await flush();
    expect(controller.view().displayedTime).toBe(
      manifest().frames.at(-1)!.time,
    );
    const pending = client.loadTile.mock.calls.find(
      ([t]) => t.frame === 'opaque-0',
    )!;
    await vi.advanceTimersByTimeAsync(4000);
    expect(pending[1]!.aborted).toBe(false);
    expect(
      client.loadTile.mock.calls.filter(([t]) => t.frame === 'opaque-0'),
    ).toHaveLength(1);
    gate.resolve('blob:next');
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    expect(controller.view().displayedTime).toBe(manifest().frames[0].time);
    expect(
      client.loadTile.mock.calls.filter(([t]) => t.frame === 'opaque-0'),
    ).toHaveLength(1);
  });
  it('bounds three frames and image bytes across looping, hide stops timers and releases', async () => {
    vi.useFakeTimers();
    const { client, controller } = setup({
      mode: 'loop',
      frame_duration_ms: 100,
    });
    await flush();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(100);
      await flush();
      expect(controller.view().bufferedFrames).toBeLessThanOrEqual(3);
      expect(controller.view().decodedBytes).toBeLessThanOrEqual(
        24 * 1024 * 1024,
      );
    }
    controller.setVisible(false);
    const count = client.loadTile.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    await flush();
    expect(client.loadTile).toHaveBeenCalledTimes(count);
    expect(controller.view().decodedBytes).toBe(0);
    expect(controller.view().images).toEqual([]);
    controller.setVisible(true);
    await flush();
    expect(controller.view().images.length).toBeGreaterThan(0);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fresh revision reloads URLs that transport has revoked', async () => {
    const { client, controller } = setup();
    await flush();
    const count = client.loadTile.mock.calls.length;
    controller.receive({ ...manifest(), revision: 1 });
    await flush();
    expect(client.loadTile.mock.calls.length).toBeGreaterThan(count);
    expect(client.releaseTile).toHaveBeenCalled();
  });
  it('empty advertised history is unavailable and clears imagery', async () => {
    const { controller } = setup();
    await flush();
    controller.receive({ ...manifest(), frames: [] });
    await flush();
    expect(controller.view().state).toBe('unavailable');
    expect(controller.view().images).toHaveLength(0);
  });
  it('outside envelope makes no tile requests and reports coverage', async () => {
    const client = new Client();
    const c = new RadarController(client);
    instances.push(c);
    c.setViewport(viewport);
    const m = manifest();
    m.coverage = {
      bounds: { south: 10, north: 11, west: 10, east: 11, zoom: 0 },
      description: 'Product envelope only',
    };
    c.receive(m);
    await flush();
    expect(client.loadTile).not.toHaveBeenCalled();
    expect(c.view().state).toBe('outside-coverage');
  });
  it('keeps source failures stale even with successfully cached tiles', async () => {
    const { controller } = setup();
    await flush();
    controller.receive({
      kind: 'status',
      schema_version: 1,
      subscription_id: 1,
      revision: 0,
      statuses: [
        {
          layer: 'radar',
          provider: 'rainviewer',
          state: 'stale',
          last_success: null,
          effective_interval_s: 300,
          message: 'Old frames',
        },
      ],
    });
    expect(controller.view().state).toBe('stale');
  });
  it('retains the exact first Universal Blue rain palette table', () => {
    expect(colors).toHaveLength(128);
    expect(colors[0]).toEqual({ dbz: -32, color: '#00000000' });
    expect(colors.map((c) => c.dbz)).toEqual(
      Array.from({ length: 128 }, (_, i) => i - 32),
    );
  });
});
