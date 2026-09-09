import defaults from '../../../contracts/card-defaults.json';
import type { CardConfig } from '../../config/types';
import type { SnapshotEvent } from '../../data/types';

export type WindConfig = NonNullable<CardConfig['wind']>;
export type WindGrid = Extract<SnapshotEvent, { kind: 'wind-grid' }>;
export type WindStatus = Extract<
  SnapshotEvent,
  { kind: 'status' }
>['statuses'][number];
export interface Vector {
  u: number;
  v: number;
}
export const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
/** Only contributing corners are required. No extrapolation, including at holes. */
export function sampleWind(
  grid: WindGrid,
  latitude: number,
  longitude: number,
): Vector | null {
  const center =
    grid.first_longitude + ((grid.width - 1) * grid.longitude_step) / 2;
  longitude += 360 * Math.round((center - longitude) / 360);
  let x = (longitude - grid.first_longitude) / grid.longitude_step;
  let y = (latitude - grid.first_latitude) / grid.latitude_step;
  const cyclic = Math.abs(grid.width * grid.longitude_step - 360) < 1e-6;
  if (cyclic) x = ((x % grid.width) + grid.width) % grid.width;
  if (
    !Number.isFinite(x + y) ||
    x < -1e-9 ||
    y < -1e-9 ||
    (!cyclic && x > grid.width - 1 + 1e-9) ||
    y > grid.height - 1 + 1e-9
  )
    return null;
  x = clamp(x, 0, cyclic ? grid.width : grid.width - 1);
  y = clamp(y, 0, grid.height - 1);
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = cyclic ? (x0 + 1) % grid.width : Math.min(x0 + 1, grid.width - 1),
    y1 = Math.min(y0 + 1, grid.height - 1);
  const dx = x - x0,
    dy = y - y0;
  let u = 0,
    v = 0;
  for (const [col, row, weight] of [
    [x0, y0, (1 - dx) * (1 - dy)],
    [x1, y0, dx * (1 - dy)],
    [x0, y1, (1 - dx) * dy],
    [x1, y1, dx * dy],
  ]) {
    if (weight === 0) continue;
    const a = grid.u_mps[row * grid.width + col],
      b = grid.v_mps[row * grid.width + col];
    if (a == null || b == null || !Number.isFinite(a + b)) return null;
    u += a * weight;
    v += b * weight;
  }
  return { u, v };
}
/** Web Mercator's conformal scale applies to both true east and true north. */
export function screenVector(
  vector: Vector,
  latitude: number,
): { x: number; y: number } {
  const scale =
    1 / Math.cos((clamp(latitude, -85.05112878, 85.05112878) * Math.PI) / 180);
  return { x: vector.u * scale, y: -vector.v * scale };
}
export function windSpeed(
  vector: Vector,
  unit: WindConfig['speed_unit'] = 'km/h',
): number {
  return (
    Math.hypot(vector.u, vector.v) *
    { 'km/h': 3.6, mph: 2.2369362921, knots: 1.9438444924, 'm/s': 1 }[unit]
  );
}
/** Shaft points FROM; feathers always encode knots, rounded to nearest five. */
export function barbParts(vector: Vector): {
  flags: number;
  full: number;
  half: number;
  calm: boolean;
} {
  let knots = Math.round(windSpeed(vector, 'knots') / 5) * 5;
  const flags = Math.floor(knots / 50);
  knots %= 50;
  return {
    flags,
    full: Math.floor(knots / 10),
    half: (knots % 10) / 5,
    calm: knots === 0 && flags === 0,
  };
}
/** A valid calm zero vector is data; a paired-null field is unavailable. */
export function hasWindData(grid: WindGrid | null): boolean {
  return grid?.u_mps.some((value) => value !== null) ?? false;
}
export interface WindView {
  config: WindConfig;
  grid: WindGrid | null;
  status: WindStatus | null;
  visible: boolean;
}
/** Receives events already validated and revision-filtered by AviadiloClient. No I/O. */
export class WindController {
  private config: WindConfig = { ...defaults.wind } as WindConfig;
  private grid: WindGrid | null = null;
  private status: WindStatus | null = null;
  private visible = true;
  private disposed = false;
  private listeners = new Set<(view: WindView) => void>();
  subscribe(listener: (view: WindView) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    listener(this.view());
    return () => this.listeners.delete(listener);
  }
  configure(config: WindConfig): void {
    if (this.disposed) return;
    const previous = this.config;
    this.config = { ...defaults.wind, ...config } as WindConfig;
    for (const [key, lo, hi] of [
      ['marker_spacing_px', 16, 256],
      ['marker_size_px', 8, 96],
      ['particle_count', 1, 1500],
      ['animation_speed', 0.1, 5],
      ['trail_length_s', 0.1, 10],
      ['opacity', 0, 1],
    ] as const) {
      const value = this.config[key]!;
      this.config[key] = clamp(
        Number.isFinite(value) ? value : defaults.wind[key],
        lo,
        hi,
      );
    }
    this.config.particle_count = Math.floor(this.config.particle_count!);
    if (JSON.stringify(previous) === JSON.stringify(this.config)) {
      this.config = previous;
      return;
    }
    this.emit();
  }
  receive(event: SnapshotEvent): void {
    if (this.disposed) return;
    if (event.kind === 'wind-grid') this.grid = event;
    else if (event.kind === 'status') {
      this.status =
        event.statuses.find((s) => s.layer === 'wind') ?? this.status;
      if (this.status?.state === 'outside-coverage') this.grid = null;
    } else return;
    this.emit();
  }
  setVisible(value: boolean): void {
    if (!this.disposed && this.visible !== value) {
      this.visible = value;
      this.emit();
    }
  }
  /** Call when a new viewport/revision starts to avoid displaying an old region. */
  clear(): void {
    this.grid = null;
    this.status = null;
    this.emit();
  }
  view(): WindView {
    const status: WindStatus | null =
      this.grid && !hasWindData(this.grid)
        ? {
            layer: 'wind',
            provider: 'dwd_icon_global',
            state: 'unavailable',
            last_success: this.status?.last_success ?? null,
            effective_interval_s: this.status?.effective_interval_s ?? 3600,
            message: 'No wind data is available for this model-valid field.',
          }
        : this.status;
    return {
      config: this.config,
      grid: this.grid,
      status,
      visible: this.visible,
    };
  }
  private emit(): void {
    for (const listener of this.listeners) listener(this.view());
  }
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.grid = null;
    this.status = null;
  }
}
