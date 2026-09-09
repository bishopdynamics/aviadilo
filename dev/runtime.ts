/** Deliberately fake HA transport, real card/client/revision/authenticated tile path.
 * Public requests must be intercepted by Playwright before this page is loaded.
 */
import '../src/aviadilo-map';
import type { AviadiloEditor } from '../src/editor/editor';
import { parseAssetPath, pictureKey } from '../src/data/assets';
import type { AviadiloMap } from '../src/aviadilo-map';
import type { HomeAssistant } from '../src/map/geo';
import {
  previewEvents,
  previewHass,
  syntheticTile,
  fixtureBlob,
} from './fixtures';
import { validateContract } from '../src/config/validate';
import { parseInfo } from '../src/data/client';
import type { CardConfig } from '../src/config/types';
import type {
  ConnectionEvent,
  HaConnection,
  WireMessage,
} from '../src/data/ha';
import type { Info, SnapshotEvent } from '../src/data/types';
import type { Map as LeafletMap } from 'leaflet';
import type { AircraftController } from '../src/layers/aircraft/model';
import type { RadarController } from '../src/layers/radar/controller';
import type { WindController } from '../src/layers/wind/model';
import type { WindLayer } from '../src/layers/wind/layer';

interface Subscription {
  callback: (event: unknown) => void;
  message: WireMessage;
}
const subscriptions = new Map<number, Subscription>();
const listeners = new Map<ConnectionEvent, Set<() => void>>();
let nextId = 1;
let generation = '0123456789abcdef0123456789abcdef:0';
let assetDelay = 0;
let assetFailure = false;
let assetCacheControl = 'public,max-age=3600';
const assetCalls: string[] = [];
let assetActive = 0,
  assetPeak = 0,
  assetAborts = 0;
let entryId: string | null = 'synthetic-entry';
let unavailable = false;
let tileDelay = 0;
let tileError = false;
let stopped = false;
let area = { latitude: 34.1, longitude: -117.72, radius_m: 50000 };
let snapshot = previewEvents();
const calls: WireMessage[] = [];
const tiles: string[] = [];
let aborts = 0;
let collections = 0;
function info(): Info {
  return parseInfo({
    schema_version: 1,
    entry_id: entryId,
    area: entryId ? area : null,
    capabilities: {
      aircraft: ['adsb_fi', 'adsb_lol'],
      radar: ['rainviewer', 'noaa_mrms', 'noaa_ksox'],
      wind: ['dwd_icon_global'],
    },
    policies: {
      adsb_fi_min_interval_s: 2,
      adsb_lol_min_interval_s: 10,
      rainviewer_requests_per_minute: 50,
      noaa_requests_per_minute: 30,
      dwd_requests_per_minute: 10,
    },
    statuses: [],
    heartbeat_s: 20,
    lease_s: 60,
    backend_memory_mib: 64,
  });
}
function emit(id: number, subscription: Subscription) {
  const m = subscription.message;
  if (m.type === 'aviadilo/subscribe_assets') return;
  const events = previewEvents(m.radar_provider as 'rainviewer');
  const status = events.find((event) => event.kind === 'status')!;
  const aircraft = snapshot.find((event) => event.kind === 'aircraft')!;
  const flags = m.layers as Record<string, boolean>;
  for (const event of [
    status,
    aircraft,
    ...events.filter((e) => ['radar-manifest', 'wind-grid'].includes(e.kind)),
  ]) {
    const layer =
      event.kind === 'radar-manifest'
        ? 'radar'
        : event.kind === 'wind-grid'
          ? 'wind'
          : event.kind;
    if (event.kind !== 'status' && !flags[layer]) continue;
    subscription.callback({
      ...event,
      subscription_id: id,
      revision: m.revision,
    });
  }
}
const connection: HaConnection = {
  connected: true,
  async subscribeMessage<T>(
    callback: (value: T) => void,
    message: WireMessage,
  ) {
    calls.push(structuredClone(message));
    if (message.type === 'aviadilo/subscribe_assets')
      validateContract('assets', { ...message, id: nextId });
    else if (message.type !== 'aviadilo/subscribe')
      throw new Error('Unsupported subscription');
    if (
      unavailable ||
      !entryId ||
      (message.type !== 'aviadilo/subscribe_assets' &&
        message.entry_id !== entryId)
    )
      throw new Error('Integration unavailable');
    const id = nextId++;
    const subscription = {
      callback: callback as (value: unknown) => void,
      message: structuredClone(message),
    };
    subscriptions.set(id, subscription);
    queueMicrotask(() => {
      if (subscriptions.has(id)) emit(id, subscription);
    });
    return async () => {
      subscriptions.delete(id);
    };
  },
  addEventListener(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(callback);
  },
  removeEventListener(event, callback) {
    listeners.get(event)?.delete(callback);
  },
};
const hass = {
  ...previewHass(),
  connection,
  async callWS<T>(message: WireMessage): Promise<T> {
    calls.push(structuredClone(message));
    if (unavailable || !connection.connected)
      throw new Error('Synthetic integration unavailable');
    if (message.type === 'aviadilo/assets_info') {
      if (!entryId) throw new Error('Integration unavailable');
      return { schema_version: 1, generation, entry_id: entryId } as T;
    }
    if (message.type === 'aviadilo/info') {
      const result = info();
      if (message.entry_id && message.entry_id !== entryId)
        result.entry_id = null;
      return result as T;
    }
    if (message.type === 'aviadilo/update_subscription') {
      const subscription = subscriptions.get(message.subscription_id as number);
      if (subscription) {
        subscription.message = structuredClone(message);
        queueMicrotask(() =>
          emit(message.subscription_id as number, subscription),
        );
      }
    }
    return {} as T;
  },
  async fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
    if (!path.startsWith('/api/aviadilo/radar?')) {
      if (init?.signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      const request = parseAssetPath(path);
      assetCalls.push(path);
      assetActive++;
      assetPeak = Math.max(assetPeak, assetActive);
      try {
        if (assetDelay)
          await new Promise<void>((resolve, reject) => {
            const signal = init?.signal;
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, assetDelay);
            const abort = () => {
              clearTimeout(timer);
              reject(new DOMException('Cancelled', 'AbortError'));
            };
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        const fail = (status: number, code: string) =>
          new Response(
            JSON.stringify({
              schema_version: 1,
              code,
              message: (
                {
                  upstream_error: 'Asset source is unavailable',
                  picture_changed: 'Entity picture has changed',
                  stale_generation: 'Asset generation has changed',
                } as Record<string, string>
              )[code],
              ...(code === 'stale_generation' ? { generation } : {}),
            }),
            {
              status,
              headers: {
                'Content-Type': 'application/json',
                'X-Aviadilo-Generation': generation,
              },
            },
          );
        if (request.generation !== generation)
          return fail(409, 'stale_generation');
        if (assetFailure) return fail(502, 'upstream_error');
        if (request.kind === 'photo') {
          const picture =
            hass.states[request.entity_id]?.attributes.entity_picture;
          if (
            typeof picture !== 'string' ||
            pictureKey(picture) !== request.picture_key
          )
            return fail(409, 'picture_changed');
        }
        const canvas = syntheticTile(
          request.kind === 'basemap' ? 'basemap' : 'photo',
        );
        if (request.kind === 'photo') {
          canvas.width = canvas.height = 128;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#e1c745';
          context.fillRect(0, 0, 128, 128);
        }
        if (request.kind === 'basemap') {
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#263d49';
          context.fillRect(0, 0, 256, 256);
          context.strokeStyle = '#49636c';
          context.strokeRect(1, 1, 254, 254);
          context.fillStyle = '#a8c0c6';
          context.fillText(`${request.z}/${request.x}/${request.y}`, 12, 24);
        }
        const blob = await fixtureBlob(canvas, init?.signal);
        return new Response(blob, {
          headers: {
            'Content-Type': 'image/png',
            'X-Aviadilo-Generation': generation,
            'Cache-Control':
              request.kind === 'photo' ? 'no-store' : assetCacheControl,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          assetAborts++;
        throw error;
      } finally {
        assetActive--;
      }
    }
    tiles.push(path);
    if (!path.startsWith('/api/aviadilo/radar?'))
      throw new Error('Unexpected path');
    const query = new URL(path, location.origin).searchParams;
    const subscription = subscriptions.get(
      Number(query.get('subscription_id')),
    );
    if (
      !subscription ||
      subscription.message.revision !== Number(query.get('revision'))
    )
      throw new Error('Stale tile revision');
    if (tileDelay)
      await new Promise<void>((resolve, reject) => {
        const signal = init?.signal;
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', abort);
          resolve();
        }, tileDelay);
        const abort = () => {
          clearTimeout(timer);
          aborts++;
          reject(new DOMException('Canceled', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    if (tileError) return new Response('', { status: 503 });
    const blob = await new Promise<Blob>((resolve) =>
      syntheticTile(query.get('frame') ?? '').toBlob(
        (blob) => resolve(blob!),
        'image/png',
      ),
    );
    return new Response(blob, { headers: { 'Content-Type': 'image/png' } });
  },
};
const cards: AviadiloMap[] = [];
const defaultConfig: CardConfig = {
  schema_version: 2,
  type: 'custom:aviadilo-map',
  layers: { aircraft: true, radar: true, wind: true, people: true },
  wind: { mode: 'arrows' },
  people: {
    trackers: [
      { entity_id: 'device_tracker.synthetic' },
      { entity_id: 'device_tracker.traveller' },
    ],
  },
};
function add(config: CardConfig = defaultConfig, hidden = false) {
  const card =
    (cards.length === 0
      ? document.querySelector<AviadiloMap>('aviadilo-map')
      : null) ?? (document.createElement('aviadilo-map') as AviadiloMap);
  if (hidden) card.style.display = 'none';
  card.setConfig(config);
  card.hass = hass;
  if (!card.isConnected) document.querySelector('main')!.append(card);
  cards.push(card);
  if (cards.length > 1) {
    document.querySelector('main')!.style.cssText =
      'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';
  }
  return cards.length - 1;
}
function connectionEvent(connected: boolean) {
  connection.connected = connected;
  for (const callback of listeners.get(connected ? 'ready' : 'disconnected') ??
    [])
    callback();
}
type Inspection = {
  assets?: {
    decoded: {
      diagnostics(): {
        active: number;
        pending: number;
        entries: number;
        bytes: number;
        owners: number;
      };
    };
  };
  map?: LeafletMap;
  aircraft?: AircraftController;
  radar?: RadarController;
  wind?: WindController;
  windLayer?: WindLayer;
  viewport?: { interact(): void; suspended: boolean };
};
function inspect(index: number) {
  return cards[index] as unknown as Inspection;
}
const timer = setInterval(() => {
  if (stopped || !subscriptions.size) return;
  collections++;
  snapshot = previewEvents();
  for (const [id, subscription] of subscriptions) emit(id, subscription);
}, 10000);
const api = {
  add,
  /** Opt-in geometry/lifecycle control; the default synthetic fixture is unchanged. */
  entity(entityId: string, state: HomeAssistant['states'][string] | null) {
    if (state) hass.states[entityId] = structuredClone(state);
    else delete hass.states[entityId];
    for (const card of cards) card.hass = { ...hass };
  },
  assets(delay = 0, failure = false, cacheControl = 'public,max-age=3600') {
    assetDelay = delay;
    assetFailure = failure;
    assetCacheControl = cacheControl;
  },
  clearAssets() {
    generation =
      generation.split(':')[0] + ':' + (Number(generation.split(':')[1]) + 1);
    for (const subscription of subscriptions.values())
      if (subscription.message.type === 'aviadilo/subscribe_assets')
        subscription.callback({
          event_type: 'aviadilo/assets_changed',
          data: { schema_version: 1, entry_id: entryId, generation },
        });
  },
  photo(entityId: string, value?: string) {
    hass.states[entityId].attributes.entity_picture = value;
    for (const card of cards) card.hass = { ...hass };
  },
  config(index: number, patch: Partial<CardConfig>) {
    cards[index].setConfig({ ...cards[index].config, ...patch });
  },
  updateHass(tokyo = false) {
    const state = previewHass(tokyo);
    Object.assign(hass, state);
    for (const card of cards) card.hass = { ...hass };
    const editor = document.querySelector<AviadiloEditor>(
      'aviadilo-map-editor',
    );
    if (editor) editor.hass = hass;
  },
  detach(index: number) {
    cards[index].remove();
  },
  attach(index: number) {
    document.querySelector('main')!.append(cards[index]);
  },
  move(index: number, latitude: number, longitude: number, zoom = 9) {
    const x = inspect(index);
    x.viewport?.interact();
    x.map?.setView([latitude, longitude], zoom, { animate: false });
  },
  select(index: number, id: string | null) {
    inspect(index).aircraft?.select(id);
  },
  seek(index: number, frame: number) {
    inspect(index).radar?.seek(frame);
  },
  emit() {
    for (const [id, subscription] of subscriptions) emit(id, subscription);
  },
  stale() {
    for (const [id, subscription] of subscriptions)
      subscription.callback({
        ...previewEvents()[0],
        subscription_id: id,
        revision: Number(subscription.message.revision) - 1,
        aircraft: [],
      });
  },
  sourceError() {
    for (const [id, subscription] of subscriptions) {
      const event = previewEvents().at(-1) as Extract<
        SnapshotEvent,
        { kind: 'status' }
      >;
      subscription.callback({
        ...event,
        subscription_id: id,
        revision: subscription.message.revision,
        statuses: event.statuses.map((s) => ({
          ...s,
          state: 'unavailable',
          message: 'Synthetic provider failure',
        })),
      });
    }
  },
  connectionEvent,
  unavailable(value: boolean) {
    unavailable = value;
  },
  entry(value: string | null) {
    entryId = value;
  },
  area(latitude: number, longitude: number) {
    area = { ...area, latitude, longitude };
  },
  tiles(delay: number, error = false) {
    tileDelay = delay;
    tileError = error;
  },
  stats() {
    return {
      subscriptions: [...subscriptions.values()].filter(
        (s) => s.message.type !== 'aviadilo/subscribe_assets',
      ).length,
      assetSubscriptions: [...subscriptions.values()].filter(
        (s) => s.message.type === 'aviadilo/subscribe_assets',
      ).length,
      assets: [...assetCalls],
      assetActive,
      assetPeak,
      assetAborts,
      listeners: [...listeners.values()].reduce((n, set) => n + set.size, 0),
      calls: structuredClone(calls),
      tiles: [...tiles],
      aborts,
      collections,
    };
  },
  inspect(index: number) {
    const c = inspect(index);
    return {
      assets: c.assets?.decoded.diagnostics(),
      center: c.map?.getCenter(),
      zoom: c.map?.getZoom(),
      suspended: c.viewport?.suspended,
      selected: c.aircraft?.view().selected?.aircraft.id,
      aircraft: c.aircraft?.view().points.length,
      radar: c.radar
        ? {
            state: c.radar.view().state,
            index: c.radar.view().index,
            images: c.radar.view().images.length,
            time: c.radar.view().displayedTime,
            buffered: c.radar.view().bufferedFrames,
          }
        : null,
      wind: c.wind?.view().grid !== null,
      windDiagnostics: c.windLayer?.diagnostics(),
    };
  },
  stopFeed() {
    stopped = true;
    clearInterval(timer);
  },
};
Object.assign(window, { aviadiloTest: api });
add();
const editor = document.querySelector<AviadiloEditor>('aviadilo-map-editor');
if (editor) {
  editor.hass = hass;
  editor.setConfig(cards[0].config);
  editor.addEventListener('config-changed', (event) =>
    cards[0].setConfig(
      (event as CustomEvent<{ config: CardConfig }>).detail.config,
    ),
  );
  document
    .querySelector('#tokyo')
    ?.addEventListener('click', () => api.updateHass(true));
  document
    .querySelector('#return')
    ?.addEventListener('click', () => api.updateHass(false));
}
export type RuntimeApi = typeof api;
