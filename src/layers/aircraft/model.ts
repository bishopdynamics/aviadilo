import { normalizeConfig } from '../../config/defaults';
import type { CardConfig } from '../../config/types';
import type { Aircraft, SnapshotEvent } from '../../data/types';
import { distanceM, point, type Point } from '../../map/geo';

export type AircraftSnapshot = Extract<SnapshotEvent, { kind: 'aircraft' }>;
export type AircraftConfig = NonNullable<CardConfig['aircraft']>;
export type AircraftStatus = Extract<
  SnapshotEvent,
  { kind: 'status' }
>['statuses'][number];
export interface AircraftRow {
  aircraft: Aircraft;
  position: Point | null;
  ageS: number | null;
  distanceM: number | null;
  stale: boolean;
}
export interface TrailPoint extends Point {
  time: number;
}
export interface AircraftView {
  rows: AircraftRow[];
  points: AircraftRow[];
  selected: AircraftRow | null;
  trail: TrailPoint[];
  config: CardConfig;
  provider: AircraftSnapshot['provider'] | null;
  fetchedAt: string | null;
  status: AircraftStatus | null;
}
interface Stored {
  aircraft: Aircraft;
  observed: number | null;
  fetched: number;
  missing: boolean;
}
export const PROVIDERS = {
  adsb_fi: { name: 'adsb.fi', url: 'https://adsb.fi' },
  adsb_lol: { name: 'ADSB.lol', url: 'https://adsb.lol' },
} as const;
const MAX_RECORDS = 10000;
const MAX_TRAIL_POINTS = 240;

/** Shared local state for map and list. Display changes never call the data client. */
export class AircraftController {
  private config: CardConfig;
  private anchor: Point | null;
  private records = new Map<string, Stored>();
  private listeners = new Set<(view: AircraftView) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private selectedId: string | null = null;
  private trail: TrailPoint[] = [];
  private fetched = -Infinity;
  private fetchedAt: string | null = null;
  private provider: AircraftSnapshot['provider'] | null = null;
  private status: AircraftStatus | null = null;
  constructor(
    config: CardConfig,
    anchor: Point | null = null,
    private clock = Date.now,
  ) {
    this.config = normalizeConfig(config);
    this.anchor = anchor;
  }
  configure(config: CardConfig, anchor: Point | null = this.anchor): void {
    this.config = normalizeConfig(config);
    this.anchor = anchor;
    this.emit();
  }
  update(snapshot: AircraftSnapshot): boolean {
    const fetched = Date.parse(snapshot.fetched_at);
    if (
      !Number.isFinite(fetched) ||
      (snapshot.provider === this.provider && fetched < this.fetched)
    )
      return false;
    if (snapshot.provider !== this.provider) {
      this.records.clear();
      this.trail = [];
      this.selectedId = null;
      this.status = null;
    }
    this.provider = snapshot.provider;
    this.fetched = fetched;
    this.fetchedAt = snapshot.fetched_at;
    for (const record of this.records.values()) record.missing = true;
    for (const aircraft of snapshot.aircraft.slice(0, MAX_RECORDS)) {
      const previous = this.records.get(aircraft.id);
      const position = point(aircraft.latitude, aircraft.longitude);
      const observed =
        position && aircraft.position_age_s !== null
          ? fetched - aircraft.position_age_s * 1000
          : null;
      if (
        !position &&
        previous &&
        point(previous.aircraft.latitude, previous.aircraft.longitude)
      ) {
        this.records.set(aircraft.id, {
          ...previous,
          aircraft: {
            ...aircraft,
            latitude: previous.aircraft.latitude,
            longitude: previous.aircraft.longitude,
          },
          missing: true,
        });
      } else {
        this.records.set(aircraft.id, {
          aircraft: { ...aircraft },
          observed,
          fetched,
          missing: false,
        });
      }
    }
    // Latest source records take priority over retained disappearances.
    if (this.records.size > MAX_RECORDS) {
      for (const [id, record] of this.records) {
        if (record.missing) this.records.delete(id);
        if (this.records.size <= MAX_RECORDS) break;
      }
    }
    this.addTrail();
    this.emit();
    return true;
  }
  setStatus(status: AircraftStatus): void {
    if (
      status.layer !== 'aircraft' ||
      (this.provider && status.provider !== this.provider)
    )
      return;
    this.status = { ...status };
    this.emit();
  }
  select(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.trail = [];
    this.addTrail();
    this.emit();
  }
  subscribe(listener: (view: AircraftView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view());
    this.timer ??= setInterval(() => this.emit(), 1000);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }
  private addTrail(): void {
    const stored = this.selectedId
      ? this.records.get(this.selectedId)
      : undefined;
    if (
      !stored ||
      stored.missing ||
      stored.observed === null ||
      !this.config.aircraft!.selected_trail_s
    )
      return;
    const position = point(stored.aircraft.latitude, stored.aircraft.longitude);
    const last = this.trail.at(-1);
    if (position && (!last || stored.observed > last.time)) {
      this.trail.push({ ...position, time: stored.observed });
      this.trail = this.trail.slice(-MAX_TRAIL_POINTS);
    }
  }
  view(now = this.clock()): AircraftView {
    const config = this.config.aircraft!;
    const freshness = this.config.freshness!;
    const rows: AircraftRow[] = [];
    for (const [id, stored] of this.records) {
      const ageS =
        stored.observed === null
          ? null
          : Math.max(0, (now - stored.observed) / 1000);
      const stale =
        stored.missing || ageS === null || ageS > freshness.max_position_age_s!;
      const expires =
        stored.observed === null
          ? stored.fetched + freshness.stale_retention_s! * 1000
          : stored.observed +
            (freshness.max_position_age_s! + freshness.stale_retention_s!) *
              1000;
      const missingExpires =
        stored.fetched + freshness.stale_retention_s! * 1000;
      if (
        stale &&
        (now >= expires || (stored.missing && now >= missingExpires))
      ) {
        this.records.delete(id);
        continue;
      }
      const aircraft = stored.aircraft;
      const position = point(aircraft.latitude, aircraft.longitude);
      const distance =
        position && this.anchor ? distanceM(position, this.anchor) : null;
      if (config.airborne_only && aircraft.on_ground !== false) continue;
      if (
        config.min_altitude_m != null &&
        (aircraft.altitude_m === null ||
          aircraft.altitude_m < config.min_altitude_m)
      )
        continue;
      if (
        config.max_altitude_m != null &&
        (aircraft.altitude_m === null ||
          aircraft.altitude_m > config.max_altitude_m)
      )
        continue;
      if (
        config.max_distance_m != null &&
        (distance === null || distance > config.max_distance_m)
      )
        continue;
      rows.push({ aircraft, position, ageS, distanceM: distance, stale });
    }
    const sortValue = (row: AircraftRow): number | string | null => {
      switch (config.sort) {
        case 'callsign':
          return row.aircraft.callsign;
        case 'altitude':
          return row.aircraft.altitude_m;
        case 'speed':
          return row.aircraft.speed_mps;
        default:
          return row.distanceM;
      }
    };
    rows.sort((a, b) => {
      const av = sortValue(a),
        bv = sortValue(b);
      if (av === null)
        return bv === null ? a.aircraft.id.localeCompare(b.aircraft.id) : 1;
      if (bv === null) return -1;
      const order =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return order || a.aircraft.id.localeCompare(b.aircraft.id);
    });
    const selected =
      rows.find((row) => row.aircraft.id === this.selectedId) ?? null;
    if (!this.records.has(this.selectedId ?? '')) {
      this.selectedId = null;
      this.trail = [];
    }
    this.trail = this.trail.filter(
      (p) => p.time >= now - config.selected_trail_s! * 1000,
    );
    return {
      rows: config.show_list ? rows.slice(0, config.list_rows) : [],
      points: config.show_map
        ? rows.filter((row) => row.position !== null)
        : [],
      selected,
      trail: selected ? [...this.trail] : [],
      config: this.config,
      provider: this.provider,
      fetchedAt: this.fetchedAt,
      status: this.status,
    };
  }
  private emit(): void {
    const view = this.view();
    for (const listener of this.listeners) listener(view);
  }
  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.listeners.clear();
    this.records.clear();
    this.trail = [];
  }
}

export function formatField(
  row: AircraftRow,
  field: string,
  config: AircraftConfig,
): string {
  const number = (
    value: number | null,
    factor: number,
    unit: string,
    digits = 0,
  ) =>
    value === null
      ? 'Unknown'
      : `${(value * factor).toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`;
  const a = row.aircraft;
  switch (field) {
    case 'altitude':
      return a.on_ground === true
        ? 'Ground'
        : number(
            a.altitude_m,
            config.altitude_unit === 'ft' ? 1 / 0.3048 : 1,
            config.altitude_unit!,
          );
    case 'speed': {
      const factors = {
        'km/h': 3.6,
        mph: 3600 / 1609.344,
        knots: 3600 / 1852,
        'm/s': 1,
      };
      return number(
        a.speed_mps,
        factors[config.speed_unit!],
        config.speed_unit!,
      );
    }
    case 'distance': {
      const factors = { km: 1 / 1000, mi: 1 / 1609.344, nmi: 1 / 1852 };
      return number(
        row.distanceM,
        factors[config.distance_unit!],
        config.distance_unit!,
        1,
      );
    }
    case 'course':
      return number(a.course_deg, 1, '° true');
    case 'vertical_rate':
      return number(
        a.vertical_rate_mps,
        config.altitude_unit === 'ft' ? 60 / 0.3048 : 1,
        config.altitude_unit === 'ft' ? 'ft/min' : 'm/s',
        1,
      );
    case 'position_age':
      return number(row.ageS, 1, 's');
    case 'ground':
      return a.on_ground === null
        ? 'Unknown'
        : a.on_ground
          ? 'On ground'
          : 'Airborne';
    default:
      return String(a[field as keyof Aircraft] ?? 'Unknown');
  }
}
export function aircraftName(row: AircraftRow): string {
  return (
    row.aircraft.callsign ??
    row.aircraft.registration ??
    row.aircraft.icao ??
    row.aircraft.id
  );
}
