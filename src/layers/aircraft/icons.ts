import type { AircraftKind } from './classification';

// Original local pictograms, drawn in a 32px square. No model-code artwork or fonts.
const PATHS: Record<AircraftKind, string> = {
  airplanes:
    'M16 2 Q18 3 18 7 L18 12 L29 20 L29 23 L18 19 L18 26 L22 29 L22 31 L16 29 L10 31 L10 29 L14 26 L14 19 L3 23 L3 20 L14 12 L14 7 Q14 3 16 2Z',
  helicopters:
    'M14 5 Q16 2 18 5 L20 11 L19 19 L17 21 L17 27 L22 27 L22 29 L10 29 L10 27 L15 27 L15 21 L13 19 L12 11Z M3 10 L29 10 M5 4 L27 16 M9 15 L9 23 M23 15 L23 23',
  gliders:
    'M16 2 L17 13 L30 16 L30 18 L17 17 L17 27 L22 29 L22 30 L16 29 L10 30 L10 29 L15 27 L15 17 L2 18 L2 16 L15 13Z',
  balloons:
    'M16 2 C2 2 3 16 11 23 L21 23 C29 16 30 2 16 2Z M11 23 L13 27 L19 27 L21 23 M13 27 L13 31 L19 31 L19 27 M16 3 C10 8 11 17 14 23 M16 3 C22 8 21 17 18 23',
  parachutists:
    'M2 14 C2 -1 30 -1 30 14 Q25 10 21 14 Q16 10 11 14 Q7 10 2 14Z M3 14 L14 23 M29 14 L18 23 M11 14 L15 23 M21 14 L17 23 M16 22 L16 27 M12 31 L16 27 L20 31 M13 25 L19 25',
  ultralights:
    'M16 3 L30 21 L16 16 L2 21Z M16 16 L16 26 M10 23 L16 26 L22 23 M13 30 L16 26 L19 30',
  drones:
    'M12 12 L20 12 L20 20 L12 20Z M7 7 L25 25 M25 7 L7 25 M3 7 A4 4 0 1 0 11 7 A4 4 0 1 0 3 7 M21 7 A4 4 0 1 0 29 7 A4 4 0 1 0 21 7 M3 25 A4 4 0 1 0 11 25 A4 4 0 1 0 3 25 M21 25 A4 4 0 1 0 29 25 A4 4 0 1 0 21 25',
  spacecraft:
    'M16 2 Q23 9 21 21 L25 28 L19 25 L16 30 L13 25 L7 28 L11 21 Q9 9 16 2Z M13 11 A3 3 0 1 0 19 11 A3 3 0 1 0 13 11',
  ground:
    'M4 11 L20 11 L20 22 L4 22Z M20 15 L25 15 L29 20 L29 25 L4 25 L4 22 M7 25 A3 3 0 1 0 13 25 A3 3 0 1 0 7 25 M21 25 A3 3 0 1 0 27 25 A3 3 0 1 0 21 25',
  unknown:
    'M16 3 L29 16 L16 29 L3 16Z M12 12 C12 7 21 7 21 12 C21 16 16 15 16 19 M16 23 L16 24',
};
const DIRECTIONAL = new Set<AircraftKind>([
  'airplanes',
  'helicopters',
  'gliders',
  'ultralights',
  'drones',
  'spacecraft',
]);
const NS = 'http://www.w3.org/2000/svg';
export interface AircraftSymbol {
  svg: SVGSVGElement;
  shape: SVGGElement;
  path: SVGPathElement;
  unknownCourse: SVGGElement;
  kind: AircraftKind | null;
}
export function createAircraftSymbol(): AircraftSymbol {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.overflow = 'visible';
  const shape = document.createElementNS(NS, 'g');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('stroke', '#101923');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  path.style.paintOrder = 'stroke fill';
  // Dual contrast stays visible against both light and dark tiles.
  shape.style.filter = 'drop-shadow(0 0 1px #fff)';
  shape.append(path);
  const unknownCourse = document.createElementNS(NS, 'g');
  unknownCourse.setAttribute('data-course-unknown', '');
  const badge = document.createElementNS(NS, 'circle');
  badge.setAttribute('cx', '27');
  badge.setAttribute('cy', '5');
  badge.setAttribute('r', '6');
  badge.setAttribute('fill', '#fff');
  badge.setAttribute('stroke', '#101923');
  const question = document.createElementNS(NS, 'path');
  question.setAttribute(
    'd',
    'M25 3 C25 0 30 1 29 3 Q29 4 27 5 L27 6 M27 8 L27 9',
  );
  question.setAttribute('fill', 'none');
  question.setAttribute('stroke', '#101923');
  question.setAttribute('stroke-width', '1.5');
  unknownCourse.append(badge, question);
  svg.append(shape, unknownCourse);
  return { svg, shape, path, unknownCourse, kind: null };
}
/** Update in place: marker, SVG and path identity survive feed/style/type edits. */
export function updateAircraftSymbol(
  symbol: AircraftSymbol,
  kind: AircraftKind,
  course: number | null,
): void {
  if (symbol.kind !== kind) {
    symbol.path.setAttribute('d', PATHS[kind]);
    symbol.svg.setAttribute('data-aircraft-kind', kind);
    symbol.kind = kind;
  }
  const known = typeof course === 'number' && Number.isFinite(course);
  symbol.svg.setAttribute('data-course-known', String(known));
  symbol.shape.setAttribute(
    'transform',
    known && DIRECTIONAL.has(kind) ? `rotate(${course} 16 16)` : '',
  );
  // With no bearing this is an upright pictogram, explicitly marked with "?".
  symbol.unknownCourse.setAttribute('display', known ? 'none' : 'inline');
}
