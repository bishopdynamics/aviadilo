import type { CardConfig } from '../../config/types';
import {
  distanceM,
  entityPoint,
  resolveAnchor,
  type HomeAssistant,
  type Point,
} from '../../map/geo';
export type PeopleConfig = NonNullable<CardConfig['people']>;
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
    const position = entityPoint(entity);
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
    const positionTime = validTime(explicit);
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
