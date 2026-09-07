import { describe, expect, it } from 'vitest';
import { selectPeople } from '../../../src/layers/people/model';
import { distanceM, type HomeAssistant } from '../../../src/map/geo';
import { normalizeConfig } from '../../../src/config/defaults';
const NOW = Date.parse('2026-09-07T12:00:00Z');
function hass(lat = 0, lon = 0, state = 'home'): HomeAssistant {
  return {
    config: { latitude: 0, longitude: 0 },
    states: {
      'device_tracker.test': {
        state,
        last_changed: '2000-01-01T00:00:00Z',
        attributes: { latitude: lat, longitude: lon },
      },
    },
  };
}
const config = normalizeConfig({
  schema_version: 1,
  type: 'custom:aviadilo-map',
  people: { trackers: [{ entity_id: 'device_tracker.test' }] },
}).people!;
describe('people selection before drawing/counting/fitting', () => {
  it('preserves zero coordinates without inventing freshness', () => {
    const result = selectPeople(config, hass(), null, NOW);
    expect(result.points[0]).toMatchObject({
      latitude: 0,
      longitude: 0,
      timestamp: null,
      timestampKind: 'unknown',
      stale: false,
    });
  });
  it('uses an inclusive geodesic boundary', () => {
    const radius = distanceM(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(
      selectPeople({ ...config, radius_m: radius }, hass(0, 1), null, NOW)
        .points,
    ).toHaveLength(1);
    expect(
      selectPeople(
        { ...config, radius_m: radius - 0.01 },
        hass(0, 1),
        null,
        NOW,
      ).points,
    ).toHaveLength(0);
  });
  it('excludes Tokyo then automatically returns', () => {
    const state = hass(35.68, 139.76);
    state.config = { latitude: 34.1, longitude: -117.72 };
    expect(selectPeople(config, state).points).toHaveLength(0);
    state.states['device_tracker.test'].attributes = {
      latitude: 34.11,
      longitude: -117.7,
    };
    expect(selectPeople(config, state).points).toHaveLength(1);
  });
  it('wraps longitude', () => {
    const state = hass(0, -179.9);
    state.config = { latitude: 0, longitude: 179.9 };
    expect(selectPeople(config, state).points).toHaveLength(1);
  });
  it('hides unavailable/unknown unless explicitly stale', () => {
    for (const state of ['unavailable', 'unknown']) {
      expect(selectPeople(config, hass(0, 0, state)).points).toHaveLength(0);
      expect(
        selectPeople({ ...config, show_stale: true }, hass(0, 0, state))
          .points[0].stale,
      ).toBe(true);
    }
  });
  it('rejects missing, nonfinite and out-of-range coordinates', () => {
    for (const value of [undefined, null, NaN, Infinity, '0', 91]) {
      const state = hass();
      state.states['device_tracker.test'].attributes.latitude = value;
      expect(
        selectPeople({ ...config, show_stale: true }, state).points,
      ).toHaveLength(0);
    }
  });
  it('fails closed for missing explicit anchor, using integration then home for default only', () => {
    expect(
      selectPeople(
        { ...config, anchor: { kind: 'zone', entity_id: 'zone.absent' } },
        hass(),
      ).anchorMissing,
    ).toBe(true);
    const state = hass(10, 10);
    expect(
      selectPeople(config, state, { latitude: 10, longitude: 10 }).points,
    ).toHaveLength(1);
    expect(selectPeople(config, state, null).points).toHaveLength(0);
  });
  it('does not use last_changed; distinguishes position timestamp and entity update', () => {
    const state = hass();
    expect(
      selectPeople({ ...config, max_age_s: 60 }, state, null, NOW).points,
    ).toHaveLength(0);
    state.states['device_tracker.test'].last_updated = '2026-09-07T11:59:45Z';
    expect(
      selectPeople({ ...config, max_age_s: 60 }, state, null, NOW).points[0]
        .timestampKind,
    ).toBe('updated');
    state.states['device_tracker.test'].attributes.position_timestamp =
      '2026-09-07T11:00:00Z';
    expect(
      selectPeople({ ...config, max_age_s: 60 }, state, null, NOW).points,
    ).toHaveLength(0);
  });
});
