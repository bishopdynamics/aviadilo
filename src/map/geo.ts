import type { HaConnection, HassTransport } from '../data/ha';
import type { CardConfig } from '../config/types';

export interface Point {
  latitude: number;
  longitude: number;
}
export interface HaEntity {
  entity_id?: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
  last_changed?: string;
}
export interface HomeAssistant {
  user?: { id: string };
  themes?: { darkMode?: boolean };
  connection?: HaConnection;
  fetchWithAuth?: HassTransport['fetchWithAuth'];
  states: Record<string, HaEntity>;
  config?: { latitude?: number; longitude?: number };
  callWS?: <T>(message: { type: string; [key: string]: unknown }) => Promise<T>;
}
export type Anchor = NonNullable<NonNullable<CardConfig['map']>['anchor']>;
export const EARTH_RADIUS_M = 6371008.8;
export function point(latitude: unknown, longitude: unknown): Point | null {
  return typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
export function entityPoint(entity?: HaEntity): Point | null {
  return point(entity?.attributes.latitude, entity?.attributes.longitude);
}
export function resolveAnchor(
  anchor: Anchor | null | undefined,
  hass?: HomeAssistant,
  integration?: Point | null,
): Point | null {
  if (!anchor && integration) return integration;
  if (anchor?.kind === 'custom')
    return point(anchor.latitude, anchor.longitude);
  if (anchor?.kind === 'zone')
    return entityPoint(hass?.states[anchor.entity_id]);
  return (
    point(hass?.config?.latitude, hass?.config?.longitude) ??
    entityPoint(hass?.states['zone.home'])
  );
}
export function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export type Bounds = [[number, number], [number, number]];
/** Smallest longitude arc, including points on either side of the dateline. */
export function pointBounds(points: Point[]): Bounds | null {
  if (!points.length) return null;
  if (points.length === 1)
    return [
      [points[0].latitude, points[0].longitude],
      [points[0].latitude, points[0].longitude],
    ];
  const longitudes = points
    .map((p) => (p.longitude + 360) % 360)
    .sort((a, b) => a - b);
  let gap = -1;
  let start = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next =
      i + 1 === longitudes.length ? longitudes[0] + 360 : longitudes[i + 1];
    if (next - longitudes[i] > gap) {
      gap = next - longitudes[i];
      start = next % 360;
    }
  }
  if (start > 180) start -= 360;
  return [
    [Math.min(...points.map((p) => p.latitude)), start],
    [Math.max(...points.map((p) => p.latitude)), start + 360 - gap],
  ];
}
export function homeBounds(home: Point, extentM: number): Bounds {
  const latitudeDelta = ((extentM / 2 / EARTH_RADIUS_M) * 180) / Math.PI;
  const longitudeDelta = Math.min(
    180,
    latitudeDelta / Math.max(0.001, Math.cos((home.latitude * Math.PI) / 180)),
  );
  return [
    [
      Math.max(-85, Math.min(85, home.latitude - latitudeDelta)),
      home.longitude - longitudeDelta,
    ],
    [
      Math.max(-85, Math.min(85, home.latitude + latitudeDelta)),
      home.longitude + longitudeDelta,
    ],
  ];
}

/** Draw markers in the same world copy as the central viewport. */
export function visibleLongitude(
  longitude: number,
  centerLongitude: number,
): number {
  return longitude + 360 * Math.round((centerLongitude - longitude) / 360);
}
