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

describe('selected person coordinates and reported active zones', () => {
  const personConfig = normalizeConfig({
    schema_version: 2,
    type: 'custom:aviadilo-map',
    people: { trackers: [{ entity_id: 'person.test', show_photo: true }] },
  }).people!;
  function personHass(): HomeAssistant {
    return {
      config: { latitude: 0, longitude: 0 },
      states: {
        'person.test': {
          state: 'home',
          last_updated: '2026-09-07T11:59:45Z',
          attributes: {
            friendly_name: 'Selected person',
            entity_picture: '/api/image/serve/person',
            in_zones: ['zone.first', 'zone.second'],
            source: 'device_tracker.test',
            gps_accuracy: 100,
            position_timestamp: '2026-09-07T11:00:00Z',
          },
        },
        'zone.first': {
          state: '1',
          attributes: {
            latitude: 0,
            longitude: 0,
            friendly_name: '<b>First zone</b>',
          },
        },
        'zone.second': {
          state: '1',
          attributes: { latitude: 0.1, longitude: 0.1 },
        },
        'device_tracker.test': {
          state: 'home',
          attributes: {
            friendly_name: 'Underlying source',
            entity_picture: '/source',
            latitude: 50,
            longitude: 50,
          },
        },
      },
    };
  }
  it('retains selected identity and zero zone coordinates without GPS accuracy/time claims', () => {
    const result = selectPeople(
      { ...personConfig, max_age_s: 60 },
      personHass(),
      null,
      NOW,
    );
    expect(result.points[0]).toMatchObject({
      entityId: 'person.test',
      name: 'Selected person',
      photo: '/api/image/serve/person',
      latitude: 0,
      longitude: 0,
      locationKind: 'zone',
      zoneId: 'zone.first',
      zoneName: '<b>First zone</b>',
      accuracyM: null,
      timestampKind: 'updated',
      timestamp: '2026-09-07T11:59:45Z',
      stale: false,
    });
  });
  it('prefers valid direct coordinates, including zero, and preserves direct freshness', () => {
    const state = personHass();
    Object.assign(state.states['person.test'].attributes, {
      latitude: 0,
      longitude: 0,
    });
    const result = selectPeople(personConfig, state, null, NOW).points[0];
    expect(result).toMatchObject({
      locationKind: 'coordinates',
      latitude: 0,
      longitude: 0,
      accuracyM: 100,
      timestampKind: 'position',
    });
    expect(result.zoneId).toBeUndefined();
    expect(
      selectPeople({ ...personConfig, max_age_s: 60 }, state, null, NOW).points,
    ).toHaveLength(0);
  });
  it('skips malformed, inaccessible, passive and invalid zones in reported order', () => {
    for (const bad of [undefined, null, NaN, Infinity, '0', 91]) {
      const state = personHass();
      state.states['person.test'].attributes.in_zones = [
        null,
        1,
        'device_tracker.test',
        'zone.absent',
        'zone.passive',
        'zone.first',
        'zone.second',
      ];
      state.states['zone.passive'] = {
        state: '0',
        attributes: { latitude: 0, longitude: 0, passive: true },
      };
      state.states['zone.first'].attributes.latitude = bad;
      expect(
        selectPeople(personConfig, state, null, NOW).points[0],
      ).toMatchObject({ zoneId: 'zone.second', latitude: 0.1, longitude: 0.1 });
    }
    const state = personHass();
    state.states['zone.first'].attributes.longitude = -181;
    expect(selectPeople(personConfig, state, null, NOW).points[0].zoneId).toBe(
      'zone.second',
    );
    state.states['person.test'].attributes.in_zones = [
      'zone.second',
      'zone.first',
    ];
    state.states['zone.first'].attributes.longitude = 0;
    expect(selectPeople(personConfig, state, null, NOW).points[0].zoneId).toBe(
      'zone.second',
    );
  });
  it('falls back for bad person coordinates but never guesses from state, home or source', () => {
    for (const latitude of [undefined, null, NaN, Infinity, '0', 91]) {
      const state = personHass();
      Object.assign(state.states['person.test'].attributes, {
        latitude,
        longitude: 0,
      });
      expect(
        selectPeople(personConfig, state, null, NOW).points[0].locationKind,
      ).toBe('zone');
      for (const in_zones of [
        undefined,
        null,
        'zone.first',
        [],
        ['zone.missing'],
      ]) {
        state.states['person.test'].attributes.in_zones = in_zones;
        expect(
          selectPeople(personConfig, state, null, NOW).points,
        ).toHaveLength(0);
      }
    }
  });
  it('distinguishes broken or missing trackers from a valid zone-resolved person', () => {
    const state = personHass();
    state.states['device_tracker.test'].attributes = {
      in_zones: ['zone.first'],
    };
    const selected = {
      ...personConfig,
      trackers: [
        { entity_id: 'device_tracker.test' },
        { entity_id: 'device_tracker.absent' },
        { entity_id: 'person.test' },
      ],
    };
    expect(selectPeople(selected, state, null, NOW)).toMatchObject({
      excluded: 2,
      points: [{ entityId: 'person.test' }],
    });
  });
  it('recomputes moved zones/person coordinates and applies radius before draw and fit', () => {
    const state = personHass();
    state.states['person.test'].attributes.in_zones = ['zone.first'];
    expect(selectPeople(personConfig, state, null, NOW).points).toHaveLength(1);
    state.states['zone.first'].attributes.longitude = 30;
    expect(selectPeople(personConfig, state, null, NOW)).toMatchObject({
      points: [],
      excluded: 1,
    });
    Object.assign(state.states['person.test'].attributes, {
      latitude: 0,
      longitude: 0,
    });
    expect(
      selectPeople(personConfig, state, null, NOW).points[0].locationKind,
    ).toBe('coordinates');
    delete state.states['person.test'].attributes.latitude;
    state.states['zone.first'].attributes.longitude = 0;
    expect(
      selectPeople(personConfig, state, null, NOW).points[0].locationKind,
    ).toBe('zone');
  });
  it('uses person update time for zone staleness, never the zone update or old GPS timestamp', () => {
    const state = personHass();
    state.states['zone.first'].last_updated = '2026-09-07T12:00:00Z';
    delete state.states['person.test'].last_updated;
    expect(
      selectPeople(personConfig, state, null, NOW).points[0],
    ).toMatchObject({ timestamp: null, timestampKind: 'unknown' });
    expect(
      selectPeople({ ...personConfig, max_age_s: 60 }, state, null, NOW).points,
    ).toHaveLength(0);
    for (const value of ['unknown', 'unavailable']) {
      state.states['person.test'].state = value;
      expect(selectPeople(personConfig, state, null, NOW).points).toHaveLength(
        0,
      );
      expect(
        selectPeople({ ...personConfig, show_stale: true }, state, null, NOW)
          .points[0].stale,
      ).toBe(true);
    }
  });
});
