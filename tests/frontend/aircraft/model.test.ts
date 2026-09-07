import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_DEFAULTS, normalizeConfig } from '../../../src/config/defaults';
import {
  AircraftController,
  formatField,
  type AircraftSnapshot,
} from '../../../src/layers/aircraft/model';
import type { Aircraft } from '../../../src/data/types';

const time = Date.parse('2026-09-07T12:00:00Z');
const record: Aircraft = {
  id: 'adsb_fi:abcdef',
  icao: 'abcdef',
  latitude: 0,
  longitude: 0,
  position_age_s: 0,
  callsign: 'ZERO',
  registration: null,
  aircraft_type: null,
  category: null,
  on_ground: false,
  altitude_m: 0,
  speed_mps: 0,
  course_deg: 0,
  vertical_rate_mps: 0,
  squawk: '0000',
};
const snapshot = (
  aircraft: Aircraft[] = [{ ...record }],
  at = time,
): AircraftSnapshot => ({
  schema_version: 1,
  subscription_id: 1,
  revision: 0,
  kind: 'aircraft',
  provider: 'adsb_fi',
  fetched_at: new Date(at).toISOString(),
  aircraft,
});
const config = () => normalizeConfig(CARD_DEFAULTS);
afterEach(() => vi.useRealTimers());

describe('local aircraft state', () => {
  it('preserves zero, distinguishes ground and unknown, and converts SI fields', () => {
    const controller = new AircraftController(
      config(),
      { latitude: 0, longitude: 0 },
      () => time,
    );
    controller.update(snapshot());
    const row = controller.view().rows[0];
    expect(row.distanceM).toBe(0);
    expect(row.stale).toBe(false);
    for (const field of [
      'altitude',
      'speed',
      'course',
      'vertical_rate',
      'position_age',
      'distance',
    ])
      expect(formatField(row, field, config().aircraft!)).toMatch(/^0 /);
    expect(
      formatField(
        { ...row, aircraft: { ...record, altitude_m: null } },
        'altitude',
        config().aircraft!,
      ),
    ).toBe('Unknown');
    expect(
      formatField(
        { ...row, aircraft: { ...record, on_ground: true } },
        'altitude',
        config().aircraft!,
      ),
    ).toBe('Ground');
    expect(
      formatField(
        { ...row, aircraft: { ...record, speed_mps: 1852 / 3600 } },
        'speed',
        config().aircraft!,
      ),
    ).toBe('1 knots');
  });
  it('filters before map/list and fit candidates while sorting null last', () => {
    const c = config();
    c.aircraft!.airborne_only = false;
    const controller = new AircraftController(
      c,
      { latitude: 0, longitude: 0 },
      () => time,
    );
    controller.update(
      snapshot([
        { ...record, id: 'adsb_fi:000001', latitude: 0, longitude: 179 },
        {
          ...record,
          id: 'adsb_fi:000002',
          latitude: null,
          longitude: null,
          altitude_m: null,
        },
        record,
      ]),
    );
    expect(controller.view().rows.map((r) => r.aircraft.id)).toEqual([
      record.id,
      'adsb_fi:000001',
      'adsb_fi:000002',
    ]);
    c.aircraft!.max_distance_m = 1;
    controller.configure(c);
    expect(controller.view().rows).toHaveLength(1);
    c.aircraft!.min_altitude_m = 1;
    controller.configure(c);
    expect(controller.view().rows).toHaveLength(0);
    c.aircraft!.max_distance_m = null;
    c.aircraft!.min_altitude_m = null;
    c.aircraft!.sort = 'altitude';
    c.aircraft!.list_rows = 1;
    controller.configure(c);
    expect(controller.view().rows).toHaveLength(1);
    expect(controller.view().points).toHaveLength(2);
    c.aircraft!.show_map = false;
    controller.configure(c);
    expect(controller.view().points).toHaveLength(0);
    c.aircraft!.show_list = false;
    controller.configure(c);
    expect(controller.view().rows).toHaveLength(0);
  });
  it('applies exact distance boundaries across longitude wrapping and missing anchors', () => {
    const c = config();
    c.aircraft!.max_distance_m = 1000;
    const controller = new AircraftController(
      c,
      { latitude: 0, longitude: 180 },
      () => time,
    );
    controller.update(snapshot([{ ...record, longitude: -180 }]));
    expect(controller.view().rows).toHaveLength(1);
    controller.configure(c, null);
    expect(controller.view().rows).toHaveLength(0);
  });
  it('ages cached responses, retains disappearances distinctly and expires without new snapshots', () => {
    vi.useFakeTimers();
    vi.setSystemTime(time);
    const c = config();
    c.freshness!.max_position_age_s = 10;
    c.freshness!.stale_retention_s = 20;
    const controller = new AircraftController(c);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.update(snapshot());
    vi.advanceTimersByTime(11000);
    expect(listener.mock.lastCall![0].rows[0].stale).toBe(true);
    // A cached replay must not renew observation age.
    controller.update(snapshot());
    expect(controller.view().rows[0].ageS).toBe(11);
    vi.advanceTimersByTime(19000);
    expect(listener.mock.lastCall![0].rows).toHaveLength(0);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });
  it('preserves last known coordinates when a fresh record loses position, without refreshing their age', () => {
    let now = time;
    const controller = new AircraftController(config(), null, () => now);
    controller.update(snapshot());
    now += 10000;
    controller.update(
      snapshot(
        [{ ...record, latitude: null, longitude: null, position_age_s: null }],
        now,
      ),
    );
    const row = controller.view().rows[0];
    expect(row.position).toEqual({ latitude: 0, longitude: 0 });
    expect(row.ageS).toBe(10);
    expect(row.stale).toBe(true);
    now += 120000;
    expect(controller.view().rows).toHaveLength(0);
  });
  it('keeps selected-only, bounded trails and rejects late snapshots', () => {
    let now = time;
    const c = config();
    c.aircraft!.selected_trail_s = 120;
    const controller = new AircraftController(c, null, () => now);
    controller.update(snapshot());
    controller.select(record.id);
    for (let i = 1; i <= 300; i++) {
      now = time + i * 100;
      controller.update(snapshot([{ ...record, longitude: i / 10000 }], now));
    }
    expect(controller.view().trail).toHaveLength(240);
    const newest = controller.view().selected!.position!.longitude;
    expect(controller.update(snapshot())).toBe(false);
    expect(controller.view().selected!.position!.longitude).toBe(newest);
    controller.select(null);
    expect(controller.view().trail).toHaveLength(0);
    controller.select(record.id);
    expect(controller.view().trail).toHaveLength(1);
    now += 601000;
    expect(controller.view().trail).toHaveLength(0);
    expect(controller.view().selected).toBeNull();
  });
  it('marks missing and unknown age as stale, excludes unknown airborne state by default', () => {
    const c = config();
    const controller = new AircraftController(c, null, () => time);
    controller.update(
      snapshot([
        { ...record, position_age_s: null },
        { ...record, id: 'adsb_fi:aaaaaa', on_ground: null },
      ]),
    );
    expect(controller.view().rows).toHaveLength(1);
    expect(controller.view().rows[0].stale).toBe(true);
    controller.update(snapshot([]));
    expect(controller.view().rows[0].stale).toBe(true);
  });
  it('clears previous source selection/history and ignores unrelated statuses', () => {
    const controller = new AircraftController(config(), null, () => time);
    controller.update(snapshot());
    controller.select(record.id);
    controller.update({
      ...snapshot([{ ...record, id: 'adsb_lol:abcdef' }]),
      provider: 'adsb_lol',
    });
    expect(controller.view().selected).toBeNull();
    expect(controller.view().rows[0].aircraft.id).toBe('adsb_lol:abcdef');
    controller.setStatus({
      layer: 'aircraft',
      provider: 'adsb_fi',
      state: 'unavailable',
      last_success: null,
      effective_interval_s: 10,
      message: null,
    });
    expect(controller.view().status).toBeNull();
  });
});
