import { normalizeConfig } from '../config/defaults';
import type { CardConfig } from '../config/types';
export type ConfigPath = (string | number)[];
export const DISTANCE_FACTORS: Record<string, number> = {
  km: 1000,
  mi: 1609.344,
  nmi: 1852,
  m: 1,
  ft: 0.3048,
};
export function displayDistance(meters: number, unit: string): number {
  return Number((meters / (DISTANCE_FACTORS[unit] ?? 1)).toPrecision(12));
}
export function storedDistance(value: number, unit: string): number {
  return value * (DISTANCE_FACTORS[unit] ?? 1);
}
export function readPath(value: unknown, path: ConfigPath): unknown {
  for (const part of path)
    value = (value as Record<string | number, unknown> | undefined)?.[part];
  return value;
}
/** Clone the whole config so future fields survive edits, including tracker entries. */
export function editConfig(
  config: CardConfig,
  path: ConfigPath,
  value: unknown,
): CardConfig {
  const draft = structuredClone(config);
  let cursor: Record<string | number, unknown> = draft;
  for (const part of path.slice(0, -1))
    cursor = cursor[part] as Record<string | number, unknown>;
  cursor[path[path.length - 1]] = value;
  const next = normalizeConfig(draft);
  if (next.map!.min_zoom! > next.map!.max_zoom!)
    throw new Error('Minimum zoom must not exceed maximum zoom.');
  if (
    next.aircraft!.min_altitude_m != null &&
    next.aircraft!.max_altitude_m != null &&
    next.aircraft!.min_altitude_m > next.aircraft!.max_altitude_m
  )
    throw new Error('Minimum altitude must not exceed maximum altitude.');
  return next;
}
/** Native accessible controls avoid depending on HA's private selector components. */
export function entitySuggestions(
  states: Record<string, unknown> | undefined,
  domain: string,
): string[] {
  return Object.keys(states ?? {})
    .filter((id) => id.startsWith(`${domain}.`))
    .sort();
}
