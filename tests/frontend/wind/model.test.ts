import { describe, expect, it } from 'vitest';
import {
  barbParts,
  sampleWind,
  screenVector,
  windSpeed,
  WindController,
  type WindGrid,
} from '../../../src/layers/wind/model';
export function grid(patch: Partial<WindGrid> = {}): WindGrid {
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
    first_latitude: 1,
    first_longitude: 0,
    latitude_step: -1,
    longitude_step: 1,
    crs: 'EPSG:4326',
    row_order: 'north-to-south',
    u_mps: [0, 2, 4, 6],
    v_mps: [2, 4, 6, 8],
    effective_resolution_deg: 1,
    attribution: 'DWD',
    ...patch,
  };
}
describe('shared wind field', () => {
  it('labels an all-null field unavailable without losing time or treating calm/partial grids as missing', () => {
    const controller = new WindController();
    controller.receive(
      grid({
        u_mps: [null, null, null, null],
        v_mps: [null, null, null, null],
      }),
    );
    expect(controller.view().status).toMatchObject({
      state: 'unavailable',
      message: 'No wind data is available for this model-valid field.',
    });
    expect(controller.view().grid?.valid_time).toBe(grid().valid_time);
    controller.receive(grid({ u_mps: [0, 0, 0, 0], v_mps: [0, 0, 0, 0] }));
    expect(controller.view().status).toBeNull();
    expect(sampleWind(controller.view().grid!, 0.5, 0.5)).toEqual({
      u: 0,
      v: 0,
    });
    controller.receive(
      grid({ u_mps: [null, 0, 0, 0], v_mps: [null, 0, 0, 0] }),
    );
    expect(controller.view().status).toBeNull();
    expect(sampleWind(controller.view().grid!, 0, 1)).toEqual({ u: 0, v: 0 });
    controller.dispose();
  });

  it('interpolates vectors, boundaries and equivalent longitude worlds without extrapolating', () => {
    expect(sampleWind(grid(), 0.5, 0.5)).toEqual({ u: 3, v: 5 });
    expect(sampleWind(grid(), 1, 360)).toEqual({ u: 0, v: 2 });
    expect(sampleWind(grid(), 0, 1)).toEqual({ u: 6, v: 8 });
    expect(sampleWind(grid(), 0, 1.001)).toBeNull();
    expect(sampleWind(grid(), 1.001, 0)).toBeNull();
  });
  it('never bridges null corners; permits exact nonmissing boundary and calm cells', () => {
    const hole = grid({ u_mps: [0, null, 0, 0], v_mps: [0, null, 0, 0] });
    expect(sampleWind(hole, 0.5, 0.5)).toBeNull();
    expect(sampleWind(hole, 1, 0)).toEqual({ u: 0, v: 0 });
    expect(sampleWind(hole, 0, 1)).toEqual({ u: 0, v: 0 });
  });
  it('handles single rows, columns and full-period cyclic seams only', () => {
    expect(
      sampleWind(grid({ height: 1, u_mps: [2, 4], v_mps: [4, 6] }), 1, 0.5),
    ).toEqual({ u: 3, v: 5 });
    expect(
      sampleWind(grid({ width: 1, u_mps: [2, 4], v_mps: [4, 6] }), 0.5, 0),
    ).toEqual({ u: 3, v: 5 });
    const full = grid({
      width: 4,
      height: 1,
      first_longitude: -135,
      longitude_step: 90,
      u_mps: [0, 2, 4, 6],
      v_mps: [0, 0, 0, 0],
    });
    expect(sampleWind(full, 1, 180)).toEqual({ u: 3, v: 0 });
    expect(sampleWind({ ...full, longitude_step: 80 }, 1, 180)).toBeNull();
  });
  it('keeps correct cardinal screen direction and latitude scale', () => {
    expect(screenVector({ u: 1, v: 0 }, 0)).toEqual({ x: 1, y: -0 });
    expect(screenVector({ u: 0, v: 1 }, 0)).toEqual({ x: 0, y: -1 });
    expect(screenVector({ u: -1, v: -1 }, 60).x).toBeCloseTo(-2);
    expect(screenVector({ u: -1, v: -1 }, 60).y).toBeCloseTo(2);
  });
  it('converts chosen units and uses 5/10/50-knot barb parts', () => {
    expect(windSpeed({ u: 3, v: 4 }, 'km/h')).toBe(18);
    expect(windSpeed({ u: 3, v: 4 }, 'm/s')).toBe(5);
    expect(windSpeed({ u: 3, v: 4 }, 'mph')).toBeCloseTo(11.1847);
    expect(barbParts({ u: 65 / 1.9438444924, v: 0 })).toEqual({
      flags: 1,
      full: 1,
      half: 1,
      calm: false,
    });
    expect(barbParts({ u: 0, v: 0 }).calm).toBe(true);
  });
  it('retains source time through visual edits and stale status; bounds all work settings', () => {
    const controller = new WindController();
    controller.receive(grid());
    controller.configure({
      particles: true,
      particle_count: 2000,
      animation_speed: 100,
      marker_spacing_px: 1,
      trail_length_s: 100,
    });
    expect(controller.view().config).toMatchObject({
      particle_count: 1500,
      animation_speed: 5,
      marker_spacing_px: 16,
      trail_length_s: 10,
    });
    controller.receive({
      schema_version: 1,
      subscription_id: 1,
      revision: 0,
      kind: 'status',
      statuses: [
        {
          layer: 'wind',
          provider: 'dwd_icon_global',
          state: 'stale',
          last_success: null,
          effective_interval_s: 3600,
          message: 'Retrying',
        },
      ],
    });
    expect(controller.view().grid?.valid_time).toBe(grid().valid_time);
    let calls = 0;
    const unsub = controller.subscribe(() => calls++);
    unsub();
    controller.setVisible(false);
    expect(calls).toBe(1);
    controller.clear();
    expect(controller.view().grid).toBeNull();
    controller.dispose();
    controller.receive(grid());
    expect(controller.view().grid).toBeNull();
  });
});
