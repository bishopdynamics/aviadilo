import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { normalizeConfig } from '../../../src/config/defaults';
const base = { schema_version: 1, type: 'custom:aviadilo-map' };

it('accepts persons only in v2 without converting saved trackers or losing row preferences', () => {
  const people = {
    trackers: [
      {
        entity_id: 'person.alex',
        name: 'Alias',
        icon: 'mdi:account',
        color: 'red',
        show_photo: true,
        future: 0,
      },
      { entity_id: 'device_tracker.phone' },
    ],
  };
  expect(() => normalizeConfig({ ...base, people })).toThrow();
  const input = {
    ...base,
    schema_version: 2,
    people,
    map: { follow_theme: false },
  };
  const before = structuredClone(input);
  const saved = normalizeConfig(input);
  expect(saved.people!.trackers).toEqual(people.trackers);
  expect(saved.map!.theme).toBe('dark');
  expect(normalizeConfig(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  expect(input).toEqual(before);
});

it('keeps invalid v2 people drafts and mixed legacy fields gated', () => {
  const person = { trackers: [{ entity_id: 'person.alex' }] };
  for (const people of [
    null,
    [],
    { trackers: null },
    { trackers: [null] },
    { trackers: [{ entity_id: 'zone.home' }] },
    { trackers: [{ entity_id: 'person.' }] },
    { trackers: [{ entity_id: 'person.alex', show_photo: 'yes' }] },
    { ...person, radius_m: -1 },
    { ...person, show_stale: 'yes' },
  ])
    expect(() =>
      normalizeConfig({ ...base, schema_version: 2, people }),
    ).toThrow();
  for (const patch of [
    { map: { follow_theme: 'no' } },
    { wind: { particles: 'yes' } },
    { wind: { static_style: 'invalid' } },
    { radar: { show_legend: 'no' } },
    { freshness: { show_source_status: null } },
  ])
    expect(() =>
      normalizeConfig({ ...base, schema_version: 2, people: person, ...patch }),
    ).toThrow();
});

describe('card v1 to v2 migration', () => {
  it('freezes the original v1 schema verbatim', async () => {
    const { createHash } = await import('node:crypto');
    expect(
      createHash('sha256')
        .update(await readFile('contracts/card-config-v1.schema.json'))
        .digest('hex'),
    ).toBe('8f050795f57a18e775aa52a6b2e406600d021f92521a2fb74b641ddd4728c6b8');
  });
  for (const particles of [undefined, false, true])
    for (const static_style of [undefined, 'off', 'arrows', 'barbs'])
      for (const enabled of [false, true])
        it(`migrates ${static_style}/${particles} with layer ${enabled}`, () => {
          const wind = Object.fromEntries(
            Object.entries({
              particles,
              static_style,
              particle_count: 0,
            }).filter(([, value]) => value !== undefined),
          );
          const source = { ...base, layers: { wind: enabled }, wind };
          const before = structuredClone(source);
          const config = normalizeConfig(source);
          expect(config.schema_version).toBe(2);
          expect(config.layers!.wind).toBe(enabled);
          expect(config.wind).toMatchObject({
            mode: particles
              ? 'particles'
              : static_style === 'barbs'
                ? 'barbs'
                : 'arrows',
            particle_count: 500,
            color: '#ecf8ff',
          });
          expect(config.wind).not.toHaveProperty('static_style');
          expect(config.wind).not.toHaveProperty('particles');
          expect(source).toEqual(before);
        });
  it('prefers explicit valid v2 settings and preserves zero, null and unknown fields', () => {
    const config = normalizeConfig({
      ...base,
      future: { keep: true },
      map: { follow_theme: false, theme: 'light', future: 0 },
      wind: {
        particles: true,
        static_style: 'barbs',
        mode: 'arrows',
        color: '#12ABef',
        opacity: 0,
        particle_count: 73,
        future: null,
      },
      people: { max_age_s: null },
      aircraft: { min_altitude_m: 0 },
      radar: {
        opacity: 0,
        show_timestamp: false,
        show_legend: true,
        show_coverage: true,
      },
      freshness: {
        show_last_update: true,
        show_source_status: false,
        show_effective_refresh: true,
      },
    });
    expect(config.map).toMatchObject({ theme: 'light', future: 0 });
    expect(config.map).not.toHaveProperty('follow_theme');
    expect(config.wind).toMatchObject({
      mode: 'arrows',
      color: '#12ABef',
      opacity: 0,
      particle_count: 73,
      future: null,
    });
    expect(config.people!.max_age_s).toBeNull();
    expect(config.aircraft!.min_altitude_m).toBe(0);
    expect(config.radar!.opacity).toBe(0);
    for (const key of ['show_timestamp', 'show_legend', 'show_coverage'])
      expect(config.radar).not.toHaveProperty(key);
    for (const key of [
      'show_last_update',
      'show_source_status',
      'show_effective_refresh',
    ])
      expect(config.freshness).not.toHaveProperty(key);
    expect(normalizeConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(config.future).toEqual({ keep: true });
  });
  it('maps legacy theme and defaults predictably', () => {
    expect(normalizeConfig(base).map!.theme).toBe('auto');
    expect(normalizeConfig(base).map!.show_you_are_here).toBe(true);
    expect(
      normalizeConfig({
        ...base,
        map: { show_you_are_here: false },
      }).map!.show_you_are_here,
    ).toBe(false);
    expect(
      normalizeConfig({ ...base, map: { follow_theme: true } }).map!.theme,
    ).toBe('auto');
    expect(
      normalizeConfig({ ...base, map: { follow_theme: false } }).map!.theme,
    ).toBe('dark');
    expect(normalizeConfig({ ...base, schema_version: 2 }).wind!.mode).toBe(
      'arrows',
    );
  });
  for (const schema_version of [1, 2])
    for (const patch of [
      { map: { theme: 'invalid' } },
      { map: { theme: null } },
      { map: { follow_theme: 'yes', theme: 'light' } },
      { map: { show_you_are_here: 'yes' } },
      { wind: { mode: 'off' } },
      { wind: { mode: null } },
      { wind: { color: '#123' } },
      { wind: { color: null } },
      { wind: { particles: 'yes', mode: 'arrows' } },
      { wind: { static_style: 'invalid', mode: 'arrows' } },
      { radar: { show_legend: 'yes' } },
      { freshness: { show_last_update: null } },
      { wind: { particle_count: -1 } },
      { wind: { particle_count: 1501 } },
    ])
      it(`rejects recognized invalid v${schema_version} ${JSON.stringify(patch)}`, () => {
        expect(() =>
          normalizeConfig({ ...base, schema_version, ...patch }),
        ).toThrow();
      });
  it('rejects v2 zero count and unsupported versions', () => {
    expect(() =>
      normalizeConfig({
        ...base,
        schema_version: 2,
        wind: { particle_count: 0 },
      }),
    ).toThrow();
    for (const version of [0, 3, '2', null, undefined])
      expect(() =>
        normalizeConfig({ ...base, schema_version: version }),
      ).toThrow('Unsupported');
  });
});

it('defaults all aircraft types through both config generations and preserves explicit empty/heli selections', () => {
  for (const schema_version of [1, 2]) {
    const base = { schema_version, type: 'custom:aviadilo-map' };
    const defaults = normalizeConfig(base);
    expect(defaults.aircraft!.types).toEqual([
      'airplanes',
      'helicopters',
      'gliders',
      'balloons',
      'parachutists',
      'ultralights',
      'drones',
      'spacecraft',
      'ground',
      'unknown',
    ]);
    for (const types of [[], ['helicopters'], ['unknown']]) {
      const input = { ...base, aircraft: { types, future: 'retained' } };
      expect(normalizeConfig(input).aircraft).toMatchObject({
        types,
        future: 'retained',
      });
      expect(input.schema_version).toBe(schema_version);
    }
    for (const types of [
      null,
      ['helicopters', 'helicopters'],
      ['A7'],
      'helicopters',
    ])
      expect(() => normalizeConfig({ ...base, aircraft: { types } })).toThrow();
    defaults.aircraft!.types!.pop();
    expect(normalizeConfig(base).aircraft!.types).toHaveLength(10);
  }
});
