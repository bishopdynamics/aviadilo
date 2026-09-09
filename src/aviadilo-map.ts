import { LitElement, html, type PropertyValues } from 'lit';
import * as L from 'leaflet';
import { normalizeConfig } from './config/defaults';
import type { CardConfig } from './config/types';
import { AviadiloClient, parseInfo, type Selection } from './data/client';
import { createHaAdapter, type HassTransport } from './data/ha';
import { AircraftController, AircraftLayer } from './layers/aircraft';
import { RadarController } from './layers/radar/controller';
import { RadarLayer } from './layers/radar/layer';
import { radarTimeline } from './layers/radar/presentation';
import { WindController } from './layers/wind/model';
import { WindLayer } from './layers/wind/layer';
import { windPanel } from './layers/wind/controls';
import { editConfig, type ConfigPath } from './editor/ha-controls';
import type { Info, SnapshotEvent, Viewport } from './data/types';
import {
  entityPoint,
  resolveAnchor,
  type HomeAssistant,
  type Point,
} from './map/geo';
import { ViewportController } from './map/viewport';
import { createBasemap } from './map/basemap';
import { estimateCardHeight, mapStyles } from './map/styles';
import { acquireAssets } from './data/assets';
import { selectPeople, type PeopleResult } from './layers/people/model';
import { PeopleLayer } from './layers/people/layer';
import { LAYER_PANES, type LayerName } from './layers/types';
import './editor/editor';

declare const __AVIADILO_VERSION__: string;
export const AVIADILO_VERSION = __AVIADILO_VERSION__;
export class AviadiloMap extends LitElement {
  static properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    config: { state: true },
    sessionLayers: { state: true },
    peopleResult: { state: true },
    integrationStatus: { state: true },
    listExpanded: { state: true },
  };
  static styles = mapStyles;
  declare hass?: HomeAssistant;
  declare preview: boolean;
  declare config: CardConfig;
  declare private sessionLayers: Record<LayerName, boolean>;
  declare private peopleResult: PeopleResult;
  declare private integrationStatus: string;
  private map?: L.Map;
  private people?: PeopleLayer;
  private basemap?: L.GridLayer;
  private assets?: ReturnType<typeof acquireAssets>;
  private assetConnection?: object;
  private assetUser?: string;
  private assetEntry?: string;
  private assetServiceEntry?: string | null;
  private viewport?: ViewportController;
  private resize?: ResizeObserver;
  private intersection?: IntersectionObserver;
  private cardVisible = false;
  declare private listExpanded: boolean;
  private get activeVisible(): boolean {
    return this.cardVisible && !document.hidden;
  }
  private interactionListeners?: AbortController;
  private tick?: ReturnType<typeof setInterval>;
  private integration?: Info;
  private discoveryKey?: string;
  private discoveryGeneration = 0;
  private controllerConnection?: object;
  private client?: AviadiloClient;
  private aircraft?: AircraftController;
  private aircraftLayer?: AircraftLayer;
  private radar?: RadarController;
  private radarLayer?: RadarLayer;
  private wind?: WindController;
  private windLayer?: WindLayer;
  private unlisteners: (() => void)[] = [];
  private transportUnlisten?: () => void;
  private selectionKey = '';
  private aircraftConfigKey = '';
  private viewConfigKey = '';
  private lastDiscovery = 0;
  private discovering = false;
  private discoveryTimeout?: ReturnType<typeof setTimeout>;
  private holdFitUntilData = false;
  private radarReady = false;
  private radarConfigKey = '';
  private refreshing = false;
  private inViewportUpdate = false;
  private readonly visibility = () => {
    this.syncBasemap();
    if (!this.activeVisible) this.suspendWeather();
    this.client?.setVisible(this.activeVisible);
    this.refresh();
  };
  constructor() {
    super();
    this.preview = false;
    this.listExpanded = true;
    this.peopleResult = { points: [], excluded: 0, anchorMissing: false };
    this.integrationStatus = 'Integration not connected';
    this.sessionLayers = {
      aircraft: true,
      radar: false,
      wind: false,
      people: true,
    };
  }
  setConfig(value: unknown): void {
    this.holdFitUntilData = !!this.config;
    this.config = normalizeConfig(value);
    this.sessionLayers = {
      aircraft: !!this.config.layers!.aircraft,
      radar: !!this.config.layers!.radar,
      wind: !!this.config.layers!.wind,
      people: !!this.config.layers!.people,
    };
  }
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('aviadilo-map-editor');
  }
  static getStubConfig(): CardConfig {
    return { schema_version: 1, type: 'custom:aviadilo-map' };
  }
  getCardSize(): number {
    // Masonry queries both before first render and after disclosures/data change.
    // Prefer actual natural content height when available; estimate saved content
    // for the initial layout or a physically hidden card.
    const height = this.renderRoot
      .querySelector('article')
      ?.getBoundingClientRect().height;
    return Math.max(
      1,
      Math.ceil((height || estimateCardHeight(this.config)) / 50),
    );
  }
  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      // Omit rows: HA sections must track natural height as disclosures expand.
    };
  }
  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.visibility);
    this.cardVisible = false;
    this.intersection = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (this.cardVisible === visible) return;
      this.cardVisible = visible;
      this.visibility();
    });
    this.intersection.observe(this);
    this.tick = setInterval(() => {
      if (this.activeVisible) {
        this.refresh();
        if (Date.now() - this.lastDiscovery >= 5000) void this.discover(true);
      }
    }, 1000);
    this.requestUpdate();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.visibility);
    clearInterval(this.tick);
    clearTimeout(this.discoveryTimeout);
    this.resize?.disconnect();
    this.intersection?.disconnect();
    this.interactionListeners?.abort();
    this.disposeComposition();
    this.transportUnlisten?.();
    this.transportUnlisten = undefined;
    this.controllerConnection = undefined;
    this.assets?.release();
    this.assets = undefined;
    this.people?.dispose();
    this.map?.remove();
    this.map = undefined;
    this.people = undefined;
    this.basemap = undefined;
    this.viewport = undefined;
    this.discoveryGeneration++;
    this.discoveryKey = undefined;
    this.discovering = false;
    this.integration = undefined;
    this.viewConfigKey = '';
  }
  protected updated(changed: PropertyValues): void {
    if (!this.config || !this.isConnected) return;
    if (changed.has('hass')) this.holdFitUntilData = false;
    if (!this.map) this.initializeMap();
    if (changed.has('config')) {
      this.map?.setMinZoom(this.config.map!.min_zoom!);
      this.map?.setMaxZoom(this.config.map!.max_zoom!);
    }
    if (changed.has('hass') || changed.has('config')) void this.discover();
    if (
      changed.has('config') ||
      changed.has('hass') ||
      changed.has('sessionLayers') ||
      changed.has('listExpanded')
    ) {
      this.syncBasemap();
      this.refresh();
    }
  }
  private initializeMap(): void {
    const container = this.renderRoot.querySelector<HTMLElement>('.map');
    if (!container) return;
    this.map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      minZoom: this.config.map!.min_zoom,
      maxZoom: this.config.map!.max_zoom,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });
    this.map.attributionControl.setPrefix(false);
    for (const [name, zIndex] of Object.entries(LAYER_PANES))
      this.map.createPane(name).style.zIndex = String(zIndex);
    this.people = new PeopleLayer(this.map);
    this.viewport = new ViewportController(this.map);
    // Registered before weather layers: revoke old revision work before their
    // own moveend handlers can use a new viewport with the previous manifest.
    this.map.on('moveend resize', () => {
      this.syncDemand();
      this.refresh();
    });
    this.interactionListeners = new AbortController();
    const signal = this.interactionListeners.signal;
    // Leaflet only emits dragstart for user drags; capture zoom/keyboard/touch intent.
    this.map.on('dragstart', () => this.viewport?.interact());
    container.addEventListener('dblclick', () => this.viewport?.interact(), {
      signal,
    });
    container.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element).closest('.leaflet-control-zoom'))
          this.viewport?.interact();
      },
      { capture: true, signal },
    );
    container.addEventListener('wheel', () => this.viewport?.interact(), {
      passive: true,
      signal,
    });
    container.addEventListener(
      'keydown',
      (event) => {
        if (
          [
            '+',
            '-',
            '=',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
          ].includes(event.key)
        )
          this.viewport?.interact();
      },
      { signal },
    );
    container.addEventListener(
      'pointerdown',
      (event) => {
        if ((event.target as Element).closest('.leaflet-control-zoom'))
          this.viewport?.interact();
      },
      { signal },
    );
    container.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length > 1) this.viewport?.interact();
      },
      { passive: true, signal },
    );
    this.resize = new ResizeObserver(() => {
      this.map?.invalidateSize({ pan: false });
      this.refresh(true);
    });
    this.resize.observe(container);
    this.syncBasemap();
    this.refresh();
  }
  private syncBasemap(): void {
    if (!this.map) return;
    const visible = this.activeVisible && this.config.map!.layout !== 'list';
    const connection = this.hasTransport(this.hass)
      ? this.hass.connection
      : undefined;
    const entry = this.config.entry_id ?? undefined;
    if (
      !visible ||
      connection !== this.assetConnection ||
      this.hass?.user?.id !== this.assetUser ||
      entry !== this.assetEntry ||
      this.integration?.entry_id !== this.assetServiceEntry
    ) {
      this.basemap?.remove();
      this.basemap = undefined;
      this.people?.setAssets(undefined);
      this.assets?.release();
      this.assets = undefined;
    }
    this.assetConnection = connection;
    this.assetUser = this.hass?.user?.id;
    this.assetEntry = entry;
    this.assetServiceEntry = this.integration?.entry_id;
    if (visible && connection && this.integration?.entry_id && !this.assets) {
      this.assets = acquireAssets(
        () => this.hass as HomeAssistant & HassTransport,
      );
      this.people?.setAssets(this.assets.decoded, entry, () => this.hass);
      void this.assets.client.ready().catch(() => undefined);
    }
    if (
      visible &&
      this.assets &&
      !this.basemap &&
      this.map.getZoom() !== undefined
    )
      this.basemap = createBasemap(this.assets.decoded, entry).addTo(this.map);
  }
  private async discover(force = false): Promise<void> {
    const hass = this.hass;
    if (!hass?.callWS) {
      this.disposeComposition();
      this.integration = undefined;
      this.integrationStatus =
        'Add the Aviadilo integration to enable external layers.';
      return;
    }
    const identity = hass.connection ?? hass.callWS;
    const key = JSON.stringify([this.config.entry_id ?? 'auto', hass.user?.id]);
    const changed =
      key !== this.discoveryKey || identity !== this.controllerConnection;
    if (changed) {
      this.disposeComposition();
      this.integration = undefined;
      this.discoveryGeneration++;
      clearTimeout(this.discoveryTimeout);
      this.discovering = false;
      this.controllerConnection = identity;
      this.discoveryKey = key;
      this.transportUnlisten?.();
      this.transportUnlisten = undefined;
      if (this.hasTransport(hass))
        this.transportUnlisten = createHaAdapter(hass).listen(() => {
          this.lastDiscovery = 0;
          if (hass.connection.connected) void this.discover(true);
        });
    }
    if (this.discovering || (!changed && !force)) return;
    this.discovering = true;
    this.lastDiscovery = Date.now();
    const generation = ++this.discoveryGeneration;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const info = parseInfo(
        await Promise.race([
          hass.callWS({
            type: 'aviadilo/info',
            schema_version: 1,
            entry_id: this.config.entry_id ?? null,
          }),
          new Promise((_, reject) => {
            timeout = this.discoveryTimeout = setTimeout(
              () => reject(new Error('Discovery timed out')),
              10000,
            );
          }),
        ]),
      );
      if (generation !== this.discoveryGeneration || !this.isConnected) return;
      if (this.integration?.entry_id !== info.entry_id)
        this.disposeComposition();
      this.integration = info;
      this.integrationStatus = info.entry_id
        ? 'Integration connected'
        : 'Add the Aviadilo integration to enable external layers.';
    } catch {
      if (generation !== this.discoveryGeneration) return;
      this.integration = undefined;
      this.integrationStatus =
        'Integration unavailable · people still use Home Assistant';
    } finally {
      clearTimeout(timeout);
      if (generation === this.discoveryGeneration) this.discovering = false;
    }
    this.refresh();
  }
  private hasTransport(
    hass?: HomeAssistant,
  ): hass is HomeAssistant & HassTransport {
    return (
      !!hass?.connection &&
      typeof hass.connection.subscribeMessage === 'function' &&
      typeof hass.callWS === 'function' &&
      typeof hass.fetchWithAuth === 'function'
    );
  }
  private disposeComposition(): void {
    this.radarLayer?.dispose();
    this.windLayer?.dispose();
    this.aircraftLayer?.dispose();
    this.unlisteners.splice(0).forEach((stop) => stop());
    this.radar?.dispose();
    this.wind?.dispose();
    this.aircraft?.dispose();
    this.client?.dispose();
    this.client = undefined;
    this.aircraft = undefined;
    this.radar = undefined;
    this.wind = undefined;
    this.radarLayer = undefined;
    this.windLayer = undefined;
    this.aircraftLayer = undefined;
    this.selectionKey = '';
    this.aircraftConfigKey = '';
    this.radarConfigKey = '';
    this.radarReady = false;
  }
  private suspendWeather(): void {
    this.radarReady = false;
    this.radar?.setVisible(false);
    this.wind?.setVisible(false);
    this.wind?.clear();
  }
  private compose(): void {
    if (!this.map || this.map.getZoom() === undefined) return;
    if (this.aircraft) return;
    this.aircraft = new AircraftController(this.config);
    this.aircraftLayer = new AircraftLayer(this.map, this.aircraft);
    this.wind = new WindController();
    this.windLayer = new WindLayer(this.map, this.wind);
    this.radar = new RadarController({
      loadTile: (tile, signal) =>
        this.client?.loadTile(tile, signal) ??
        Promise.reject(new Error('Integration not connected')),
      releaseTile: (url) => this.client?.releaseTile(url),
    });
    this.radarLayer = new RadarLayer(this.radar);
    this.radarLayer.attach(this.map);
    this.radar.setVisible(false);
    this.unlisteners.push(
      this.aircraft.subscribe(() => {
        this.requestUpdate();
        if (!this.refreshing) this.refresh();
      }),
      this.radar.subscribe(() => this.requestUpdate()),
      this.wind.subscribe(() => this.requestUpdate()),
    );
  }
  private flags() {
    const map = this.config.map!.layout !== 'list';
    return {
      aircraft:
        this.sessionLayers.aircraft &&
        ((map && !!this.config.aircraft!.show_map) ||
          (this.listExpanded &&
            this.config.map!.layout !== 'map' &&
            !!this.config.aircraft!.show_list)),
      radar: map && this.sessionLayers.radar,
      wind:
        map &&
        this.sessionLayers.wind &&
        (this.config.wind!.static_style !== 'off' ||
          (!!this.config.wind!.particles &&
            this.config.wind!.particle_count! > 0)),
    };
  }
  private currentViewport(): Viewport | null {
    if (!this.map || this.map.getZoom() === undefined) return null;
    const bounds = this.map.getBounds();
    if (
      bounds.getSouth() >= bounds.getNorth() ||
      bounds.getWest() >= bounds.getEast()
    )
      return null;
    const normalize = (n: number) => ((((n + 180) % 360) + 360) % 360) - 180;
    const wide = bounds.getEast() - bounds.getWest() >= 360;
    return {
      south: Math.max(-85.05112878, bounds.getSouth()),
      north: Math.min(85.05112878, bounds.getNorth()),
      west: wide ? -180 : normalize(bounds.getWest()),
      east: wide ? 180 : normalize(bounds.getEast()),
      zoom: this.map.getZoom(),
    };
  }
  private syncDemand(): void {
    if (!this.config || !this.aircraft || !this.isConnected) return;
    const visible = this.activeVisible;
    if (!visible) {
      this.suspendWeather();
      this.client?.setActive(false);
      return;
    }
    const layers = this.flags();
    const viewport =
      this.currentViewport() ??
      (!layers.radar && !layers.wind
        ? { south: -1, north: 1, west: -1, east: 1, zoom: 2 }
        : null);
    if (!viewport) {
      this.suspendWeather();
      this.client?.setActive(false);
      return;
    }
    this.wind?.setVisible(visible && layers.wind);
    if (!this.integration?.entry_id || !this.hasTransport(this.hass)) return;
    // Aircraft-only demand has no viewport semantics. Keep its selection stable
    // on local filter/fit changes; the integration owns the collection area.
    const selection: Selection = {
      entry_id: this.integration.entry_id,
      layers,
      radar_provider: this.config.radar!.provider!,
      viewport:
        layers.radar || layers.wind
          ? viewport
          : { south: -1, north: 1, west: -1, east: 1, zoom: 2 },
    };
    const key = JSON.stringify(selection);
    const demanded = visible && Object.values(layers).some(Boolean);
    if (key !== this.selectionKey) {
      this.suspendWeather();
      this.selectionKey = key;
      this.client?.setSelection(selection);
    }
    if (!this.client && demanded) {
      const hass = this.hass;
      // Capture the stable connection, while HTTP/WS methods always use the latest
      // reactive hass value (including refreshed auth) from this same connection.
      this.client = new AviadiloClient(
        createHaAdapter({
          connection: hass.connection,
          callWS: (message) => this.hass!.callWS!(message),
          fetchWithAuth: (path, init) => this.hass!.fetchWithAuth!(path, init),
        }),
        selection,
        {
          event: (event) => this.receive(event),
          info: (info) => {
            this.integration = info;
            this.refresh();
          },
          state: (state) => {
            if (state !== 'active') this.suspendWeather();
            if (state === 'unavailable')
              this.integrationStatus = 'Integration unavailable · reconnecting';
            else if (state === 'active')
              this.integrationStatus = 'Integration connected';
          },
          error: () => {
            this.integrationStatus = 'Integration unavailable · reconnecting';
          },
        },
      );
    }
    this.client?.setActive(demanded);
    this.radar?.setVisible(demanded && layers.radar && this.radarReady);
    this.wind?.setVisible(demanded && layers.wind);
  }
  private receive(event: SnapshotEvent): void {
    if (event.kind === 'aircraft') {
      this.holdFitUntilData = false;
      this.aircraft?.update(event);
    }
    if (event.kind === 'status')
      for (const status of event.statuses)
        if (status.layer === 'aircraft') this.aircraft?.setStatus(status);
    // Receive the current manifest while hidden; only then permit new tile loads.
    this.radar?.receive(event);
    if (event.kind === 'radar-manifest') {
      this.radarReady = true;
      this.radar?.setVisible(this.activeVisible && this.flags().radar);
    }
    this.wind?.receive(event);
    this.refresh();
  }
  private editLocal = (path: ConfigPath, value: unknown): void => {
    this.config = editConfig(this.config, path, value);
  };
  private state(): HomeAssistant | undefined {
    return this.hass;
  }
  private refresh(resized = false): void {
    if (!this.config || !this.map || this.refreshing) return;
    this.refreshing = true;
    try {
      const hass = this.state();
      const peopleConfig = this.config.people!;
      const result = this.sessionLayers.people
        ? selectPeople(peopleConfig, hass, this.integration?.area)
        : { points: [], excluded: 0, anchorMissing: false };
      if (JSON.stringify(result) !== JSON.stringify(this.peopleResult))
        this.peopleResult = result;
      const home = resolveAnchor(this.config.map!.anchor, hass);
      const viewKey = JSON.stringify([
        this.config.map!.anchor,
        home,
        this.config.map!.mode,
        this.config.map!.extent_m,
        this.config.map!.min_zoom,
        this.config.map!.max_zoom,
      ]);
      if (viewKey !== this.viewConfigKey) {
        this.viewConfigKey = viewKey;
        this.holdFitUntilData = false;
        this.viewport?.recenter();
      }
      const aircraftConfig = {
        ...this.config,
        aircraft: {
          ...this.config.aircraft,
          show_map:
            this.sessionLayers.aircraft &&
            this.config.map!.layout !== 'list' &&
            this.config.aircraft!.show_map,
          show_list:
            this.sessionLayers.aircraft &&
            this.config.map!.layout !== 'map' &&
            this.config.aircraft!.show_list,
        },
      };
      const aircraftKey = JSON.stringify([
        aircraftConfig.aircraft,
        this.config.freshness,
        this.integration?.area ?? home,
      ]);
      if (this.aircraft && aircraftKey !== this.aircraftConfigKey) {
        this.aircraftConfigKey = aircraftKey;
        this.aircraft.configure(aircraftConfig, this.integration?.area ?? home);
      }
      const points: Point[] = [
        ...result.points,
        ...(this.aircraftLayer?.fitPoints() ?? []),
      ];
      for (const id of this.config.map!.include_zones!) {
        const zone = entityPoint(hass?.states[id]);
        if (zone) points.push(zone);
      }
      if (!this.inViewportUpdate && (!this.holdFitUntilData || resized)) {
        this.inViewportUpdate = true;
        try {
          this.viewport?.update(
            this.config.map!,
            home,
            points,
            Date.now(),
            resized,
          );
        } finally {
          this.inViewportUpdate = false;
        }
      }
      this.people?.update(
        !this.activeVisible || this.config.map!.layout === 'list'
          ? []
          : result.points,
        peopleConfig,
      );
      const uncomposed = !this.aircraft;
      this.compose();
      if (uncomposed && this.aircraft) {
        this.aircraftConfigKey = aircraftKey;
        this.aircraft.configure(aircraftConfig, this.integration?.area ?? home);
      }
      const radarKey = JSON.stringify(this.config.radar);
      if (radarKey !== this.radarConfigKey) {
        this.radarConfigKey = radarKey;
        this.radar?.configure(this.config.radar!);
      }
      this.wind?.configure(this.config.wind!);
      this.syncDemand();
      this.syncBasemap();
    } finally {
      this.refreshing = false;
    }
  }
  private recenter(): void {
    this.viewport?.recenter();
    this.refresh();
  }
  private toggle(layer: LayerName): void {
    this.sessionLayers = {
      ...this.sessionLayers,
      [layer]: !this.sessionLayers[layer],
    };
  }
  protected render() {
    if (!this.config) return html``;
    return html`<article
      class=${this.config.map!.follow_theme ? '' : 'fixed-theme'}
      aria-label="Aviadilo map card"
    >
      <header>
        <h2>${this.config.title || 'Aviadilo'}</h2>
      </header>
      <nav aria-label="Map layers">
        ${(['aircraft', 'radar', 'wind', 'people'] as const).map(
          (layer) =>
            html`<button
              type="button"
              aria-pressed=${String(this.sessionLayers[layer])}
              @click=${() => this.toggle(layer)}
            >
              ${layer[0].toUpperCase() + layer.slice(1)}
            </button>`,
        )}${this.config.map!.show_recenter
          ? html`<button type="button" @click=${this.recenter}>
              Recenter
            </button>`
          : ''}
      </nav>
      <div
        class=${`map${this.config.map!.layout === 'list' ? ' hidden' : ''}`}
        style=${`height:${this.config.map!.height_px}px`}
        role="region"
        aria-label="Interactive household map"
      ></div>
      <div class="status" aria-live="polite">
        <p>
          ${this.sessionLayers.people
            ? `${this.peopleResult.points.length} people visible · ${this.peopleResult.excluded} filtered or unavailable`
            : 'People hidden'}
        </p>
        ${this.peopleResult.anchorMissing
          ? html`<p>People hidden: radius anchor unavailable.</p>`
          : ''}${!resolveAnchor(this.config.map!.anchor, this.state())
          ? html`<p>
              Map anchor unavailable. Choose a valid home, zone or custom
              location.
            </p>`
          : ''}
        <p>${this.integrationStatus}</p>
        ${this.flags().aircraft && this.aircraft
          ? html`<p>
              Aircraft:
              ${this.aircraft.view().status?.state ??
              (this.aircraft.view().provider
                ? 'current'
                : 'waiting for integration')}
            </p>`
          : ''}
      </div>
      ${this.config.map!.layout !== 'map' &&
      this.config.aircraft!.show_list &&
      this.sessionLayers.aircraft
        ? html`<details
            class="aircraft-list"
            open
            @toggle=${(event: Event) => {
              this.listExpanded = (event.target as HTMLDetailsElement).open;
            }}
          >
            <summary>Aircraft list</summary>
            <aviadilo-aircraft-list
              .controller=${this.aircraft}
            ></aviadilo-aircraft-list>
          </details>`
        : ''}
      ${this.flags().radar && this.radar
        ? html`<section class="weather" aria-label="Radar">
            ${radarTimeline(this.radar.view(), this.radar)}
          </section>`
        : ''}
      ${this.config.map!.layout !== 'list' &&
      this.sessionLayers.wind &&
      this.wind
        ? html`<details class="weather">
            <summary>
              Wind ·
              ${this.wind.view().status?.state ??
              (this.wind.view().grid
                ? 'current'
                : this.flags().wind
                  ? 'waiting for integration'
                  : 'display off')}
            </summary>
            ${windPanel(this.wind.view(), this.editLocal)}
          </details>`
        : ''}
    </article>`;
  }
}
if (!customElements.get('aviadilo-map'))
  customElements.define('aviadilo-map', AviadiloMap);
const registry = window as unknown as {
  customCards?: {
    type: string;
    name: string;
    description: string;
    preview: boolean;
  }[];
};
registry.customCards ??= [];
if (!registry.customCards.some((card) => card.type === 'aviadilo-map'))
  registry.customCards.push({
    type: 'aviadilo-map',
    name: 'Aviadilo',
    description: 'Aircraft, weather and household map',
    preview: true,
  });
