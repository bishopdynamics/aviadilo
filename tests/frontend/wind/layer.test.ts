import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as L from 'leaflet';
vi.mock('leaflet', () => ({ DomUtil: { setPosition: vi.fn() } }));
import { WindLayer, drawWindMarker } from '../../../src/layers/wind/layer';
import { WindController, type WindGrid } from '../../../src/layers/wind/model';
function fixture(): WindGrid {
  return {
    schema_version: 1,
    subscription_id: 1,
    revision: 0,
    kind: 'wind-grid',
    provider: 'dwd_icon_global',
    coverage_id: 'dwd__Icon_reg025_fd_sl_UV10M',
    valid_time: '2026-09-07T12:00:00Z',
    run_time: null,
    width: 2,
    height: 2,
    first_latitude: 90,
    first_longitude: -180,
    latitude_step: -180,
    longitude_step: 360,
    crs: 'EPSG:4326',
    row_order: 'north-to-south',
    u_mps: [3, 3, 3, 3],
    v_mps: [4, 4, 4, 4],
    effective_resolution_deg: 360,
    attribution: 'DWD',
  };
}
function setup() {
  const context = {
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
  };
  const doc = new EventTarget() as EventTarget & {
    hidden: boolean;
    createElement: () => unknown;
  };
  doc.hidden = false;
  const canvases: {
    width: number;
    height: number;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  doc.createElement = () => {
    const c = {
      style: {},
      width: 0,
      height: 0,
      getContext: () => context,
      remove: vi.fn(),
    };
    canvases.push(c);
    return c;
  };
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = false;
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { matchMedia: () => media });
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++serial, fn);
    return serial;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const map = {
    getPane: () => ({ style: {}, append: vi.fn() }),
    getSize: () => ({ x: 800, y: 600 }),
    getContainer: () => ({ isConnected: true }),
    containerPointToLayerPoint: () => ({ x: 0, y: 0 }),
    containerPointToLatLng: ([x, y]: number[]) => ({
      lat: 40 - y / 100,
      lng: -120 + x / 100,
    }),
    on: vi.fn(),
    off: vi.fn(),
    attributionControl: { addAttribution: vi.fn(), removeAttribution: vi.fn() },
  };
  const controller = new WindController();
  controller.configure({
    mode: 'particles',
    particle_count: 1500,
  });
  controller.receive(fixture());
  const layer = new WindLayer(map as unknown as L.Map, controller);
  const step = (ms: number) => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const fn of callbacks) fn(ms);
  };
  return {
    context,
    doc,
    media,
    canvases,
    map,
    controller,
    layer,
    frames,
    step,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('wind canvas lifecycle', () => {
  it('renders exclusive modes with chosen stroke/fill, retains grid and restores reduced-motion particles', () => {
    const f = setup();
    const grid = f.controller.view().grid;
    expect(f.context.stroke).not.toHaveBeenCalled();
    f.step(0);
    f.step(34);
    expect(f.context.stroke).toHaveBeenCalled();
    for (const mode of ['arrows', 'barbs'] as const) {
      f.context.stroke.mockClear();
      f.controller.configure({
        mode,
        color: '#a1B2c3',
        opacity: 0.3,
        particle_count: 73,
      });
      expect(f.context.stroke).toHaveBeenCalled();
      expect(f.context.strokeStyle).toBe('#a1B2c3');
      expect(f.context.fillStyle).toBe('#a1B2c3');
      expect(f.context.globalAlpha).toBe(0.3);
      expect(f.layer.diagnostics()).toMatchObject({
        animating: false,
        particles: 0,
      });
      expect(f.frames.size).toBe(0);
      expect(f.controller.view().grid).toBe(grid);
    }
    f.context.stroke.mockClear();
    f.controller.configure({
      ...f.controller.view().config,
      mode: 'particles',
    });
    expect(f.context.stroke).not.toHaveBeenCalled();
    f.media.matches = true;
    f.media.dispatchEvent(new Event('change'));
    expect(f.context.stroke).toHaveBeenCalled();
    expect(f.controller.view().config.mode).toBe('particles');
    expect(f.context.strokeStyle).toBe('#a1B2c3');
    expect(f.layer.diagnostics().animating).toBe(false);
    f.media.matches = false;
    f.media.dispatchEvent(new Event('change'));
    f.step(0);
    f.step(34);
    expect(f.layer.diagnostics().particles).toBe(73);
    expect(f.controller.view().grid).toBe(grid);
    f.layer.dispose();
  });

  it('stops existing animation for an all-null field and resumes for calm or partial data', () => {
    const f = setup();
    f.step(0);
    f.step(34);
    expect(f.layer.diagnostics().particles).toBe(1500);
    f.controller.receive({
      ...fixture(),
      u_mps: [null, null, null, null],
      v_mps: [null, null, null, null],
    });
    expect(f.layer.diagnostics()).toMatchObject({
      particles: 0,
      animating: false,
    });
    expect(f.frames.size).toBe(0);
    const strokes = f.context.stroke.mock.calls.length;
    f.controller.configure({
      ...f.controller.view().config,
      particle_count: 200,
    });
    f.doc.dispatchEvent(new Event('visibilitychange'));
    f.step(10000);
    expect(f.context.stroke.mock.calls.length).toBe(strokes);
    expect(f.frames.size).toBe(0);
    f.controller.receive({
      ...fixture(),
      u_mps: [0, 0, 0, 0],
      v_mps: [0, 0, 0, 0],
    });
    expect(f.layer.diagnostics().animating).toBe(true);
    expect(f.context.arc).not.toHaveBeenCalled();
    f.controller.receive({
      ...fixture(),
      u_mps: [null, 0, 0, 0],
      v_mps: [null, 0, 0, 0],
    });
    expect(f.layer.diagnostics().animating).toBe(true);
    f.layer.dispose();
    f.controller.dispose();
  });

  it('uses downwind arrows and opposite FROM barbs', () => {
    const f = setup();
    f.context.rotate.mockClear();
    drawWindMarker(
      f.context as unknown as CanvasRenderingContext2D,
      0,
      0,
      { u: 5, v: 0 },
      0,
      'arrows',
      24,
    );
    expect(f.context.rotate).toHaveBeenLastCalledWith(0);
    drawWindMarker(
      f.context as unknown as CanvasRenderingContext2D,
      0,
      0,
      { u: 5, v: 0 },
      0,
      'barbs',
      24,
    );
    expect(f.context.rotate).toHaveBeenLastCalledWith(Math.PI);
    f.layer.dispose();
  });
  it('bounds frame rate, particles and canvas bytes; reduced motion and hidden stop immediately', () => {
    const f = setup();
    f.step(0);
    f.step(34);
    expect(f.layer.diagnostics()).toMatchObject({
      particles: 1500,
      animating: true,
    });
    expect(f.layer.diagnostics().canvasBytes).toBeLessThanOrEqual(
      8 * 1024 * 1024,
    );
    const pending = [...f.frames.keys()];
    f.controller.configure(f.controller.view().config);
    f.controller.setVisible(true);
    f.controller.receive({
      schema_version: 1,
      subscription_id: 1,
      revision: 0,
      kind: 'status',
      statuses: [],
    });
    expect([...f.frames.keys()]).toEqual(pending);
    expect(f.layer.diagnostics().particles).toBe(1500);
    const strokes = f.context.stroke.mock.calls.length;
    f.step(40);
    f.step(50);
    expect(f.context.stroke.mock.calls.length).toBe(strokes);
    f.media.matches = true;
    f.media.dispatchEvent(new Event('change'));
    expect(f.frames.size).toBe(0);
    expect(f.layer.diagnostics().particles).toBe(0);
    expect(f.context.stroke.mock.calls.length).toBeGreaterThan(strokes);
    f.media.matches = false;
    f.media.dispatchEvent(new Event('change'));
    expect(f.frames.size).toBe(1);
    f.doc.hidden = true;
    f.doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.frames.size).toBe(0);
    f.doc.hidden = false;
    f.doc.dispatchEvent(new Event('visibilitychange'));
    f.step(100000);
    expect(f.layer.diagnostics().particles).toBe(0);
    f.controller.setVisible(false);
    expect(f.frames.size).toBe(0);
    f.layer.dispose();
  });
  it('disposes all surfaces/listeners/animation and reattaches once', () => {
    const f = setup();
    f.layer.dispose();
    expect(f.frames.size).toBe(0);
    expect(
      f.canvases.every(
        (c) => c.width === 0 && c.remove.mock.calls.length === 1,
      ),
    ).toBe(true);
    f.controller.configure({ mode: 'particles' });
    f.media.dispatchEvent(new Event('change'));
    expect(f.frames.size).toBe(0);
    f.layer.attach(f.map as unknown as L.Map);
    expect(f.frames.size).toBe(1);
    expect(f.canvases).toHaveLength(4);
    f.layer.dispose();
    expect(f.map.off).toHaveBeenCalled();
    f.controller.dispose();
  });
});
