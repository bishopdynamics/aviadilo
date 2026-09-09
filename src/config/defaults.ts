import defaults from '../../contracts/card-defaults.json';
import integrationDefaults from '../../contracts/integration-defaults.json';
import type { CardConfig } from './types';
import type { IntegrationConfig } from './integration-types';
import { validateContract } from './validate';
import { migrateConfig } from './migrate';

export const CARD_DEFAULTS = defaults as unknown as CardConfig;
export const INTEGRATION_DEFAULTS = integrationDefaults as IntegrationConfig;

/** Merge only known panels, preserving future fields at every edited level. */
export function normalizeConfig(input: unknown): CardConfig {
  const config = migrateConfig(input);
  const defaults = structuredClone(CARD_DEFAULTS);
  const result = { ...defaults, ...config };
  for (const key of [
    'map',
    'layers',
    'radar',
    'wind',
    'people',
    'aircraft',
    'freshness',
  ] as const) {
    Object.assign(result, { [key]: { ...defaults[key], ...config[key] } });
  }
  validateContract('card-config', result);
  return result;
}
