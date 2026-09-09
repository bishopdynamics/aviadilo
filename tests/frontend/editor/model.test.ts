import { describe, expect, it } from 'vitest';
import {
  editConfig,
  displayDistance,
  storedDistance,
  entitySuggestions,
  peopleSuggestions,
} from '../../../src/editor/ha-controls';
import { normalizeConfig } from '../../../src/config/defaults';
const config = normalizeConfig({
  schema_version: 1,
  type: 'custom:aviadilo-map',
  future: { flag: true },
  people: {
    future: 'kept',
    trackers: [{ entity_id: 'device_tracker.test', future: { flag: true } }],
  },
});
describe('editor edits', () => {
  it('offers persons first and edits an existing tracker identity while retaining its preferences', () => {
    expect(
      peopleSuggestions({
        'device_tracker.z': {},
        'person.z': {},
        'person.a': {},
        'zone.a': {},
        'device_tracker.a': {},
      }),
    ).toEqual(['person.a', 'person.z', 'device_tracker.a', 'device_tracker.z']);
    const source = normalizeConfig({
      ...config,
      people: {
        trackers: [
          {
            entity_id: 'device_tracker.test',
            name: 'Custom',
            icon: 'mdi:account',
            color: '#abcdef',
            show_photo: true,
            future: { keep: true },
          },
        ],
      },
    });
    const changed = editConfig(
      source,
      ['people', 'trackers', 0, 'entity_id'],
      'person.test',
    );
    expect(changed.people!.trackers![0]).toEqual({
      ...source.people!.trackers![0],
      entity_id: 'person.test',
    });
    expect(normalizeConfig(JSON.parse(JSON.stringify(changed)))).toEqual(
      changed,
    );
    expect(() =>
      editConfig(
        changed,
        ['people', 'trackers', 0, 'entity_id'],
        'sensor.test',
      ),
    ).toThrow();
  });
  it('round trips future root/panel/tracker fields', () => {
    const next = editConfig(
      config,
      ['people', 'trackers', 0, 'name'],
      'New name',
    );
    const saved = normalizeConfig(JSON.parse(JSON.stringify(next)));
    expect(saved.future).toEqual({ flag: true });
    expect(saved.people!.future).toBe('kept');
    expect(saved.people!.trackers![0]).toMatchObject({
      name: 'New name',
      future: { flag: true },
    });
    expect(config.people!.trackers![0].name).toBeUndefined();
  });
  it('keeps canonical metres during unit changes', () => {
    const next = editConfig(config, ['people', 'radius_unit'], 'mi');
    expect(next.people!.radius_m).toBe(50000);
    for (const unit of ['km', 'mi', 'nmi', 'm', 'ft'])
      expect(storedDistance(displayDistance(50000, unit), unit)).toBeCloseTo(
        50000,
        5,
      );
  });
  it('preserves zero vs null and refuses invalid edits without changing prior config', () => {
    expect(
      editConfig(config, ['aircraft', 'min_altitude_m'], 0).aircraft!
        .min_altitude_m,
    ).toBe(0);
    expect(
      editConfig(config, ['people', 'max_age_s'], null).people!.max_age_s,
    ).toBeNull();
    for (const value of [0, -1, NaN, Infinity])
      expect(() => editConfig(config, ['people', 'radius_m'], value)).toThrow();
    expect(config.people!.radius_m).toBe(50000);
  });
  it('validates coupled zoom and altitude limits', () => {
    expect(() => editConfig(config, ['map', 'min_zoom'], 20)).toThrow(
      'Minimum zoom',
    );
    const next = editConfig(config, ['aircraft', 'max_altitude_m'], 0);
    expect(() => editConfig(next, ['aircraft', 'min_altitude_m'], 1)).toThrow(
      'Minimum altitude',
    );
  });
  it('offers direct device trackers without person conversion', () => {
    expect(
      entitySuggestions(
        { 'device_tracker.b': {}, 'device_tracker.a': {}, 'person.a': {} },
        'device_tracker',
      ),
    ).toEqual(['device_tracker.a', 'device_tracker.b']);
  });
});

it('retains fixed height and future map fields through graphical layout edits', () => {
  const saved = normalizeConfig({
    ...config,
    map: { height_px: 777, future_layout: 'keep' },
  });
  expect(saved.map).toMatchObject({
    auto_height: false,
    show_layer_buttons: true,
  });
  const auto = editConfig(saved, ['map', 'auto_height'], true);
  const hidden = editConfig(auto, ['map', 'show_layer_buttons'], false);
  expect(normalizeConfig(hidden).map).toMatchObject({
    auto_height: true,
    show_layer_buttons: false,
    height_px: 777,
    future_layout: 'keep',
  });
  expect(editConfig(hidden, ['map', 'auto_height'], false).map!.height_px).toBe(
    777,
  );
  expect(() => editConfig(hidden, ['map', 'auto_height'], 'true')).toThrow();
});
