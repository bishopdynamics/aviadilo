import type { CardConfig } from '../../config/types';
import {
  distanceM,
  entityPoint,
  resolveAnchor,
  type HomeAssistant,
  type Point,
} from '../../map/geo';
export type PeopleConfig = NonNullable<CardConfig['people']>;
export type PeopleLocation = Point &
  (
    | { locationKind: 'coordinates' }
    | {
        locationKind: 'zone';
        zoneId: string;
        zoneName: string;
      }
  );

/** Resolve only the selected entity and its explicitly reported active zones. */
export function resolvePeopleLocation(
  entityId: string,
  hass: HomeAssistant | undefined,
): PeopleLocation | null {
  const entity = hass?.states[entityId];
  const coordinates = entityPoint(entity);
  if (coordinates) return { ...coordinates, locationKind: 'coordinates' };
  const zones = entity?.attributes.in_zones;
  if (!entityId.startsWith('person.') || !Array.isArray(zones)) return null;
  for (const zoneId of zones) {
    if (typeof zoneId !== 'string' || !zoneId.startsWith('zone.')) continue;
    const zone = hass?.states[zoneId];
    if (!zone || zone.attributes.passive) continue;
    const position = entityPoint(zone);
    if (position)
      return {
        ...position,
        locationKind: 'zone',
        zoneId,
        zoneName:
          typeof zone.attributes.friendly_name === 'string'
            ? zone.attributes.friendly_name
            : zoneId,
      };
  }
  return null;
}
export interface PersonPoint extends Point {
  entityId: string;
  name: string;
  icon?: string;
  color: string;
  photo?: string;
  accuracyM: number | null;
  stale: boolean;
  timestamp: string | null;
  timestampKind: 'position' | 'updated' | 'unknown';
  locationKind: PeopleLocation['locationKind'];
  zoneId?: string;
  zoneName?: string;
}
export interface PeopleResult {
  points: PersonPoint[];
  excluded: number;
  anchorMissing: boolean;
}
export function selectPeople(
  config: PeopleConfig,
  hass: HomeAssistant | undefined,
  integration?: Point | null,
  now = Date.now(),
): PeopleResult {
  const anchor = resolveAnchor(config.anchor, hass, integration);
  const result: PeopleResult = {
    points: [],
    excluded: 0,
    anchorMissing: !!config.radius_enabled && !anchor,
  };
  for (const tracker of config.trackers ?? []) {
    const entity = hass?.states[tracker.entity_id];
    const position = resolvePeopleLocation(tracker.entity_id, hass);
    if (!entity || !position || result.anchorMissing) {
      result.excluded++;
      continue;
    }
    // last_changed tracks zone/state transitions, not position updates.
    const explicit =
      entity.attributes.position_timestamp ?? entity.attributes.gps_timestamp;
    const validTime = (value: unknown): string | null =>
      typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) <= now
        ? value
        : null;
    // A zone point is not a GPS observation, even if an old GPS time remains.
    const positionTime =
      position.locationKind === 'coordinates' ? validTime(explicit) : null;
    const timestamp = positionTime ?? validTime(entity.last_updated);
    const timestampKind = positionTime
      ? 'position'
      : timestamp
        ? 'updated'
        : 'unknown';
    const age = timestamp ? (now - Date.parse(timestamp)) / 1000 : null;
    const stale =
      ['unknown', 'unavailable'].includes(entity.state) ||
      (config.max_age_s != null && (age === null || age > config.max_age_s));
    if (
      (stale && !config.show_stale) ||
      (config.radius_enabled &&
        anchor &&
        distanceM(anchor, position) > (config.radius_m ?? 50000))
    ) {
      result.excluded++;
      continue;
    }
    const accuracy = entity.attributes.gps_accuracy;
    result.points.push({
      ...position,
      entityId: tracker.entity_id,
      name:
        tracker.name ||
        (typeof entity.attributes.friendly_name === 'string'
          ? entity.attributes.friendly_name
          : tracker.entity_id),
      icon:
        tracker.icon ||
        (typeof entity.attributes.icon === 'string'
          ? entity.attributes.icon
          : undefined),
      color: tracker.color || '#4da3ff',
      photo:
        tracker.show_photo &&
        typeof entity.attributes.entity_picture === 'string'
          ? entity.attributes.entity_picture
          : undefined,
      accuracyM:
        position.locationKind === 'coordinates' &&
        typeof accuracy === 'number' &&
        Number.isFinite(accuracy) &&
        accuracy >= 0
          ? accuracy
          : null,
      stale,
      timestamp,
      timestampKind,
    });
  }
  return result;
}
