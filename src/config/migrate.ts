import type { CardConfig } from './types';
import { ContractError, validateContract } from './validate';

/** Validate both generations' recognized fields before consuming legacy keys.
 * Loading only migrates this clone; HA persists v2 on an ordinary editor save.
 */
export function migrateConfig(input: unknown): CardConfig {
  const version = (input as { schema_version?: unknown } | null)
    ?.schema_version;
  if (version !== 1 && version !== 2)
    throw new ContractError('Unsupported Aviadilo schema version');
  const legacy = structuredClone(input) as Record<string, unknown>;
  const frozenInput = { ...legacy, schema_version: 1 };
  if (version === 2) {
    // Current people settings have no consumed legacy keys and now allow persons.
    // Validate the entire v2 draft first, then retain frozen validation of all
    // other sections so malformed mixed legacy fields cannot be discarded.
    validateContract('card-config', legacy);
    delete (frozenInput as Record<string, unknown>).people;
  }
  validateContract('card-config-v1', frozenInput);
  const result = legacy as unknown as CardConfig;
  result.schema_version = 2;
  const map = result.map;
  if (map) {
    if (!Object.hasOwn(map, 'theme'))
      map.theme = map.follow_theme === false ? 'dark' : 'auto';
    delete map.follow_theme;
  }
  const wind = result.wind;
  if (wind) {
    // Null is invalid, not an absent explicit setting.
    if (!Object.hasOwn(wind, 'mode'))
      wind.mode =
        wind.particles === true
          ? 'particles'
          : wind.static_style === 'barbs'
            ? 'barbs'
            : 'arrows';
    if (!Object.hasOwn(wind, 'color')) wind.color = '#ecf8ff';
    if (version === 1 && wind.particle_count === 0) wind.particle_count = 500;
    delete wind.static_style;
    delete wind.particles;
  }
  if (result.radar)
    for (const key of ['show_timestamp', 'show_legend', 'show_coverage'])
      delete result.radar[key];
  if (result.freshness)
    for (const key of [
      'show_last_update',
      'show_effective_refresh',
      'show_source_status',
    ])
      delete result.freshness[key];
  validateContract('card-config', result);
  return result;
}
