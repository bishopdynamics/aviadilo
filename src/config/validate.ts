import * as validators from './validators.js';
import type { CardConfig } from './types';

export type SchemaName =
  | 'card-config'
  | 'card-config-v1'
  | 'integration-config'
  | 'command'
  | 'event'
  | 'info'
  | 'assets';

export class ContractError extends Error {}

// JSON Schema owns scalar constraints. These checks own geometry and related fields.
export function validateContract(name: SchemaName, value: unknown): void {
  const version = (value as { schema_version?: unknown } | null)
    ?.schema_version;
  if (version !== (name === 'card-config' ? 2 : 1))
    throw new ContractError('Unsupported Aviadilo schema version');
  const validator =
    validators[name.replaceAll('-', '_') as keyof typeof validators];
  if (!validator(value))
    throw new ContractError(JSON.stringify(validator.errors));
  const data = value as Record<string, unknown>;
  if (name === 'assets' && data.kind === 'basemap') {
    const tile = data as unknown as { z: number; x: number; y: number };
    if (tile.x >= 2 ** tile.z || tile.y >= 2 ** tile.z)
      throw new ContractError('Invalid basemap geometry');
  }
  const viewport = data.viewport as
    | { south: number; north: number }
    | undefined;
  if (viewport && viewport.south >= viewport.north)
    throw new ContractError('Viewport south must precede north');
  if (data.kind === 'wind-grid') {
    const grid = data as unknown as {
      width: number;
      height: number;
      u_mps: unknown[];
      v_mps: unknown[];
      first_latitude: number;
      first_longitude: number;
      latitude_step: number;
      longitude_step: number;
    };
    const cells = grid.width * grid.height;
    if (
      cells > 4096 ||
      grid.u_mps.length !== cells ||
      grid.v_mps.length !== cells
    )
      throw new ContractError(
        'Wind grid dimensions do not match bounded arrays',
      );
    if (
      grid.first_latitude + (grid.height - 1) * grid.latitude_step < -90 ||
      grid.first_longitude + (grid.width - 1) * grid.longitude_step > 180
    )
      throw new ContractError('Wind grid extends outside coordinate bounds');
    if (grid.u_mps.some((u, i) => (u === null) !== (grid.v_mps[i] === null)))
      throw new ContractError(
        'Wind vector components must share a missing-cell mask',
      );
  }
  if (data.kind === 'radar-manifest') {
    const coverage = data.coverage as {
      bounds: { south: number; north: number };
    } | null;
    if (coverage && coverage.bounds.south >= coverage.bounds.north)
      throw new ContractError('Invalid coverage bounds');
    const frames = data.frames as { id: string }[];
    if (new Set(frames.map((frame) => frame.id)).size !== frames.length)
      throw new ContractError('Duplicate frame IDs');
  }
  if (data.kind === 'aircraft') {
    const aircraft = data.aircraft as {
      id: string;
      latitude: number | null;
      longitude: number | null;
    }[];
    if (new Set(aircraft.map((item) => item.id)).size !== aircraft.length)
      throw new ContractError('Duplicate aircraft IDs');
    for (const item of aircraft) {
      if (!item.id.startsWith(`${String(data.provider)}:`))
        throw new ContractError('Aircraft identity provider mismatch');
      if ((item.latitude === null) !== (item.longitude === null))
        throw new ContractError(
          'Position coordinates must both be known or null',
        );
    }
  }
  if (name === 'card-config' || name === 'card-config-v1') {
    const card = value as CardConfig;
    if ((card.map?.min_zoom ?? 2) > (card.map?.max_zoom ?? 18))
      throw new ContractError('Minimum zoom exceeds maximum');
    const low = card.aircraft?.min_altitude_m;
    const high = card.aircraft?.max_altitude_m;
    if (low != null && high != null && low > high)
      throw new ContractError('Minimum altitude exceeds maximum');
    const trackers = card.people?.trackers;
    if (
      trackers &&
      new Set(trackers.map((item) => item.entity_id)).size !== trackers.length
    )
      throw new ContractError('Duplicate trackers');
  }
}
