import type { HomeAssistant } from '../src/map/geo';
export function previewHass(tokyo = false): HomeAssistant {
  const last_updated = new Date().toISOString();
  return {
    config: { latitude: 34.1, longitude: -117.72 },
    states: {
      'zone.home': {
        state: '0',
        attributes: {
          latitude: 34.1,
          longitude: -117.72,
          friendly_name: 'Synthetic home',
        },
      },
      'device_tracker.synthetic': {
        state: 'home',
        last_updated,
        attributes: {
          latitude: 34.11,
          longitude: -117.7,
          friendly_name: 'Alex · synthetic',
          gps_accuracy: 150,
        },
      },
      'device_tracker.traveller': {
        state: 'not_home',
        last_updated,
        attributes: {
          latitude: tokyo ? 35.68 : 34.16,
          longitude: tokyo ? 139.76 : -117.68,
          friendly_name: 'Sam · synthetic',
          gps_accuracy: 500,
        },
      },
    },
  };
}

/** Fixtures live in the bundle so HA's raw picker needs no network or HA state. */
export function previewEvents(
  radarProvider: 'rainviewer' | 'noaa_mrms' | 'noaa_ksox' = 'rainviewer',
  now = Date.now(),
): import('../src/data/types').SnapshotEvent[] {
  const envelope = {
    schema_version: 1 as const,
    subscription_id: 1,
    revision: 0,
  };
  const time = new Date(now).toISOString();
  return [
    {
      ...envelope,
      kind: 'aircraft',
      provider: 'adsb_fi',
      fetched_at: time,
      aircraft: [0, 1, 2].map((index) => ({
        id: `adsb_fi:synthetic${index}`,
        icao: null,
        latitude: 34.1 + (index - 1) * 0.09,
        longitude: -117.72 + (index - 1) * 0.13,
        position_age_s: 0,
        callsign: `DEMO${index + 1}`,
        registration: 'SYNTHETIC',
        aircraft_type: 'Demo',
        category: ['A1', 'A7', null][index],
        on_ground: false,
        altitude_m: index === 0 ? 0 : 1200 + index * 500,
        speed_mps: index === 0 ? 0 : 90,
        course_deg: index === 2 ? null : 45 + index * 80,
        vertical_rate_mps: 0,
        squawk: null,
      })),
    },
    {
      ...envelope,
      kind: 'radar-manifest',
      provider: radarProvider,
      product:
        radarProvider === 'rainviewer'
          ? 'radar'
          : radarProvider === 'noaa_mrms'
            ? 'conus_bref_qcd'
            : 'ksox_sr_bref',
      generated_at: time,
      frames: [2, 1, 0].map((offset) => ({
        id: `synthetic-${offset}`,
        time: new Date(now - offset * 300000).toISOString(),
      })),
      native_max_zoom: 7,
      attribution: 'Synthetic radar · offline',
      coverage: null,
    },
    {
      ...envelope,
      kind: 'wind-grid',
      provider: 'dwd_icon_global',
      coverage_id: 'synthetic',
      valid_time: time,
      run_time: null,
      width: 5,
      height: 5,
      first_latitude: 36,
      first_longitude: -120,
      latitude_step: -1,
      longitude_step: 1,
      crs: 'EPSG:4326',
      row_order: 'north-to-south',
      u_mps: [8, ...Array<number>(24).fill(8)],
      v_mps: [3, ...Array<number>(24).fill(3)],
      effective_resolution_deg: 1,
      attribution: 'Synthetic wind · offline',
    },
    {
      ...envelope,
      kind: 'status',
      statuses: [
        {
          layer: 'aircraft',
          provider: 'adsb_fi',
          state: 'current',
          last_success: time,
          effective_interval_s: 10,
          message: 'Synthetic aircraft',
        },
        {
          layer: 'radar',
          provider: radarProvider,
          state: 'current',
          last_success: time,
          effective_interval_s: 300,
          message: 'Synthetic radar',
        },
        {
          layer: 'wind',
          provider: 'dwd_icon_global',
          state: 'current',
          last_success: time,
          effective_interval_s: 3600,
          message: 'Synthetic wind',
        },
      ],
    },
  ];
}
export function syntheticTile(frame = ''): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const shift = frame.endsWith('2') ? 40 : frame.endsWith('1') ? 20 : 0;
  const gradient = context.createRadialGradient(
    120 + shift,
    130,
    5,
    120 + shift,
    130,
    110,
  );
  gradient.addColorStop(0, '#f9c542bb');
  gradient.addColorStop(0.3, '#24cc55aa');
  gradient.addColorStop(1, '#2088ee00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return canvas;
}

/** Model fetch cancellation across asynchronous synthetic PNG serialization too.
 * A late browser encoder callback must neither publish a response nor retain its
 * canvas after the request has lost its final interested owner. */
export function fixtureBlob(
  canvas: HTMLCanvasElement,
  signal?: AbortSignal | null,
): Promise<Blob> {
  let stop = () => {};
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const finish = (blob: Blob | null, aborted = false) => {
      if (settled) return;
      settled = true;
      if (aborted) reject(new DOMException('Cancelled', 'AbortError'));
      else if (blob) resolve(blob);
      else reject(new Error('Synthetic PNG encoding failed'));
    };
    const abort = () => finish(null, true);
    stop = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else canvas.toBlob((blob) => finish(blob), 'image/png');
  }).finally(() => {
    stop();
    canvas.width = canvas.height = 0;
  });
}
