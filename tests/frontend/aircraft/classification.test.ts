import { describe, expect, it } from 'vitest';
import {
  aircraftKind,
  AIRCRAFT_KINDS,
} from '../../../src/layers/aircraft/classification';

describe('reported emitter classification', () => {
  it.each([
    ...['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((c) => [c, 'airplanes']),
    ['A7', 'helicopters'],
    ['B1', 'gliders'],
    ['B2', 'balloons'],
    ['B3', 'parachutists'],
    ['B4', 'ultralights'],
    ['B6', 'drones'],
    ['B7', 'spacecraft'],
    ...['C1', 'C2', 'C3', 'C4', 'C5'].map((c) => [c, 'ground']),
  ])(
    '%s maps to %s, normalizing case and outer whitespace',
    (category, kind) => {
      expect(aircraftKind(category)).toBe(kind);
      expect(aircraftKind(` \t${category.toLowerCase()}\n`)).toBe(kind);
    },
  );
  it.each([
    null,
    undefined,
    '',
    'A0',
    'B0',
    'B5',
    'C0',
    'C6',
    'C7',
    'D1',
    'A8',
    'A10',
    'A 7',
    '7',
    7,
    {},
    [],
    'constructor',
    '__proto__',
    'H60',
    'A320',
  ])('keeps malformed/reserved/missing %j unknown', (value) => {
    expect(aircraftKind(value)).toBe('unknown');
  });
  it('has ten unique stable groups', () => {
    expect(new Set(AIRCRAFT_KINDS).size).toBe(10);
  });
});
