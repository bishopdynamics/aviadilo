/** Presentation groups derived only from the reported emitter category. */
export const AIRCRAFT_KINDS = [
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
] as const;
export type AircraftKind = (typeof AIRCRAFT_KINDS)[number];
export const AIRCRAFT_KIND_LABELS: Record<AircraftKind, string> = {
  airplanes: 'Airplanes',
  helicopters: 'Helicopters',
  gliders: 'Gliders',
  balloons: 'Balloons / airships',
  parachutists: 'Parachutists',
  ultralights: 'Ultralights / hang-gliders / paragliders',
  drones: 'Drones',
  spacecraft: 'Spacecraft',
  ground: 'Ground vehicles / obstacles',
  unknown: 'Unknown',
};
export const AIRCRAFT_TYPE_HELP =
  'Types depend on reported categories, which can be missing. Enable Unknown to include uncategorized traffic. No types selected hides all aircraft.';
const CATEGORIES: Readonly<Record<string, AircraftKind>> = {
  A1: 'airplanes',
  A2: 'airplanes',
  A3: 'airplanes',
  A4: 'airplanes',
  A5: 'airplanes',
  A6: 'airplanes',
  A7: 'helicopters',
  B1: 'gliders',
  B2: 'balloons',
  B3: 'parachutists',
  B4: 'ultralights',
  B6: 'drones',
  B7: 'spacecraft',
  C1: 'ground',
  C2: 'ground',
  C3: 'ground',
  C4: 'ground',
  C5: 'ground',
};
export function aircraftKind(category: unknown): AircraftKind {
  if (typeof category !== 'string') return 'unknown';
  const code = category.trim().toUpperCase();
  return Object.hasOwn(CATEGORIES, code) ? CATEGORIES[code] : 'unknown';
}
