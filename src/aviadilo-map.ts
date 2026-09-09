import { LitElement, html, type PropertyValues } from 'lit';
import * as L from 'leaflet';
import { normalizeConfig } from './config/defaults';
import type { CardConfig } from './config/types';
import { AviadiloClient, parseInfo, type Selection } from './data/client';
import { createHaAdapter, type HassTransport } from './data/ha';
import { AircraftController, AircraftLayer } from './layers/aircraft';
import { RadarController } from './layers/radar/controller';
import { RadarLayer } from './layers/radar/layer';
import { WindController } from './layers/wind/model';
import { WindLayer } from './layers/wind/layer';
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
import { resolveTheme } from './map/theme';
import { PageHeightController } from './map/height';
import { acquireAssets } from './data/assets';
import {
  inspectionKey,
  publishInspection,
  type InspectionSnapshot,
} from './data/status';
import { PROVIDERS } from './layers/aircraft/model';
import {
  StatusTracker,
  issueDetails,
  type DataIssue,
  type LayerHealth,
} from './map/status';
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
    statusOpen: { state: true },
    autoMapHeight: { state: true },
  };
  static styles = mapStyles;
  declare hass?: HomeAssistant;
  declare preview: boolean;
  declare config: CardConfig;
  declare private sessionLayers: Record<LayerName, boolean>;
  declare private peopleResult: PeopleResult;
  declare private integrationStatus: string;
  declare private statusOpen: boolean;
  private issues: DataIssue[] = [];
  private readonly statusTracker = new StatusTracker();
  private stopInspection?: () => void;
  private lastRadarInspection?: InspectionSnapshot['radar'];
  private lastWindValidTime: string | null = null;
  private inspectionConnection?: object;
  private inspectionUser?: string;
  private motionMedia?: MediaQueryList;
  private basemapTiles = new Map<
    HTMLElement,
    'loading' | 'current' | 'stale' | 'unavailable'
  >();
  private basemapLastSuccess: string | null = null;
  private readonly outsideStatus = (event: Event) => {
    if (!this.statusOpen) return;
    const path = event.composedPath();
    if (
      !path.includes(this.renderRoot.querySelector('.status-popover')!) &&
      !path.includes(this.renderRoot.querySelector('.status-indicator')!)
    )
      this.closeStatus(false);
  };
  private readonly statusKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.statusOpen) {
      event.preventDefault();
      this.closeStatus(true);
    }
  };
  private themeMedia?: MediaQueryList;
  private readonly themeChanged = () => this.requestUpdate();
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
  private pageHeight?: PageHeightController;
  declare private autoMapHeight?: number;
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
  private currentStatuses: Partial<
    Record<
      'aircraft' | 'radar' | 'wind',
      Extract<SnapshotEvent, { kind: 'status' }>['statuses'][number]
    >
  > = {};
  private radarConfigKey = '';
  private refreshing = false;
  private inViewportUpdate = false;
  private readonly visibility = () => {
    this.syncBasemap();
    if (!this.activeVisible) this.suspendWeather();
    this.client?.setVisible(this.activeVisible);
    this.refresh();
    this.requestUpdate();
  };
  constructor() {
    super();
    this.statusOpen = false;
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
    const next = normalizeConfig(value);
    const previous = this.config;
    this.holdFitUntilData = !!previous;
    this.config = next;
    // Local layer buttons survive style edits. Apply a saved layer setting only
    // when that setting changes, or when initializing this element.
    this.sessionLayers = Object.fromEntries(
      (['aircraft', 'radar', 'wind', 'people'] as const).map((layer) => [
        layer,
        !next.map!.show_layer_buttons ||
        !previous ||
        previous.layers![layer] !== next.layers![layer]
          ? !!next.layers![layer]
          : this.sessionLayers[layer],
      ]),
    ) as Record<LayerName, boolean>;
  }
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('aviadilo-map-editor');
  }
  static getStubConfig(): CardConfig {
    return { schema_version: 2, type: 'custom:aviadilo-map' };
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
    this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionMedia.addEventListener('change', this.themeChanged);
    document.addEventListener('pointerdown', this.outsideStatus);
    document.addEventListener('keydown', this.statusKey);
    document.addEventListener('scroll', this.positionStatus, true);
    window.addEventListener('resize', this.positionStatus);
    this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    this.themeMedia.addEventListener('change', this.themeChanged);
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
        this.requestUpdate();
        if (Date.now() - this.lastDiscovery >= 5000) void this.discover(true);
      }
    }, 1000);
    this.requestUpdate();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopInspection?.();
    this.stopInspection = undefined;
    this.inspectionConnection = undefined;
    this.statusTracker.clear();
    this.statusOpen = false;
    this.motionMedia?.removeEventListener('change', this.themeChanged);
    this.motionMedia = undefined;
    document.removeEventListener('pointerdown', this.outsideStatus);
    document.removeEventListener('keydown', this.statusKey);
    document.removeEventListener('scroll', this.positionStatus, true);
    window.removeEventListener('resize', this.positionStatus);
    this.themeMedia?.removeEventListener('change', this.themeChanged);
    this.themeMedia = undefined;
    document.removeEventListener('visibilitychange', this.visibility);
    clearInterval(this.tick);
    clearTimeout(this.discoveryTimeout);
    this.resize?.disconnect();
    this.pageHeight?.disconnect();
    this.pageHeight = undefined;
    this.autoMapHeight = undefined;
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
    this.basemapTiles.clear();
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
    if (!this.issues.length && this.statusOpen) this.closeStatus(false);
    this.publishState();
    this.positionStatus();
    if (
      changed.has('config') ||
      changed.has('sessionLayers') ||
      changed.has('listExpanded') ||
      !this.pageHeight
    )
      this.syncPageHeight();
  }
  private syncPageHeight(): void {
    if (!this.config.map!.auto_height || this.config.map!.layout === 'list') {
      this.pageHeight?.disconnect();
      this.pageHeight = undefined;
      this.autoMapHeight = undefined;
      return;
    }
    if (!this.pageHeight) {
      const article = this.renderRoot.querySelector<HTMLElement>('article');
      const map = this.renderRoot.querySelector<HTMLElement>('.map');
      if (article && map)
        this.pageHeight = new PageHeightController(
          this,
          article,
          map,
          (height) => {
            this.autoMapHeight = height;
          },
        );
    }
    this.pageHeight?.schedule();
  }
  private initializeMap(): void {
    const container = this.renderRoot.querySelector<HTMLElement>('.map');
    if (!container) return;
    this.map = L.map(container, {
      zoomControl: true,
      attributionControl: false,
      minZoom: this.config.map!.min_zoom,
      maxZoom: this.config.map!.max_zoom,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });
    this.map.createPane('basemap').style.zIndex = '200';
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
      this.map?.invalidateSize({ pan: true, animate: false });
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
      this.basemapTiles.clear();
      this.basemapLastSuccess = null;
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
    ) {
      this.basemap = createBasemap(this.assets.decoded, entry);
      this.basemap.on('tileloadstart', (event: L.TileEvent) => {
        this.basemapTiles.set(event.tile, 'loading');
        this.requestUpdate();
      });
      this.basemap.on('tileload', (event: L.TileEvent) => {
        this.basemapTiles.set(
          event.tile,
          event.tile.dataset.aviadiloCache === 'stale' ? 'stale' : 'current',
        );
        if (event.tile.dataset.aviadiloCache !== 'stale')
          this.basemapLastSuccess = new Date().toISOString();
        this.requestUpdate();
      });
      this.basemap.on('tileerror', (event: L.TileEvent) => {
        // Generation cancellation is a new load, not a source failure.
        this.basemapTiles.set(
          event.tile,
          event.tile.title === 'Asset generation changed'
            ? 'loading'
            : 'unavailable',
        );
        this.requestUpdate();
      });
      this.basemap.on('tileunload', (event: L.TileEvent) => {
        this.basemapTiles.delete(event.tile);
        this.requestUpdate();
      });
      this.basemap.options.pane = 'basemap';
      this.basemap.addTo(this.map);
    }
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
    this.lastRadarInspection = undefined;
    this.lastWindValidTime = null;
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
    this.currentStatuses = {};
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
      wind: map && this.sessionLayers.wind,
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
      this.currentStatuses = {};
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
      for (const status of event.statuses) {
        if (
          status.layer !== 'radar' ||
          status.provider === this.config.radar!.provider
        )
          this.currentStatuses[status.layer] = status;
        if (status.layer === 'aircraft') this.aircraft?.setStatus(status);
      }
    // Receive the current manifest while hidden; only then permit new tile loads.
    this.radar?.receive(event);
    if (event.kind === 'radar-manifest') {
      this.radarReady = true;
      this.radar?.setVisible(this.activeVisible && this.flags().radar);
    }
    this.wind?.receive(event);
    this.refresh();
  }
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
    if (!this.config.map!.show_layer_buttons) return;
    this.sessionLayers = {
      ...this.sessionLayers,
      [layer]: !this.sessionLayers[layer],
    };
  }
  private closeStatus(focus: boolean): void {
    this.statusOpen = false;
    if (focus)
      this.renderRoot
        .querySelector<HTMLButtonElement>('.status-indicator')
        ?.focus();
  }
  private async toggleStatus(): Promise<void> {
    if (this.statusOpen) {
      this.closeStatus(true);
      return;
    }
    this.statusOpen = true;
    await this.updateComplete;
    const popover =
      this.renderRoot.querySelector<HTMLElement>('.status-popover');
    const trigger =
      this.renderRoot.querySelector<HTMLElement>('.status-indicator');
    if (!popover || !trigger) return;
    // Top-layer presentation escapes card clipping, including short list-only
    // cards, without adding a backdrop or changing the closed card's height.
    popover.showPopover();
    this.positionStatus();
    popover.focus();
  }
  private readonly positionStatus = (): void => {
    if (!this.statusOpen) return;
    const popover =
      this.renderRoot.querySelector<HTMLElement>('.status-popover');
    const trigger =
      this.renderRoot.querySelector<HTMLElement>('.status-indicator');
    if (!popover?.matches(':popover-open') || !trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    popover.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - box.width - 12))}px`;
    popover.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - box.height - 12))}px`;
  };
  private health(): LayerHealth[] {
    if (!this.activeVisible) return [];
    const result: LayerHealth[] = [];
    const flags = this.flags(),
      map = this.config.map!.layout !== 'list';
    const connection = this.hass?.connection;
    const available =
      !!this.integration?.entry_id &&
      !!connection?.connected &&
      this.hasTransport(this.hass);
    const source = (
      layer: LayerHealth['layer'],
      request: string,
    ): LayerHealth => ({
      layer,
      request,
      state: 'loading',
      cause: 'Waiting for requested data.',
      recovery:
        'Wait for the normal refresh. If loading continues, check the Aviadilo integration and Home Assistant connection.',
    });
    const external = (item: LayerHealth): LayerHealth =>
      available
        ? this.client?.state === 'unavailable' && item.layer !== 'Basemap'
          ? {
              ...item,
              state: 'unavailable',
              cause:
                'The Aviadilo data subscription is unavailable; reconnecting.',
            }
          : item
        : {
            ...item,
            state:
              this.discovering && !this.integration
                ? 'loading'
                : this.integration?.entry_id
                  ? 'unavailable'
                  : 'configuration-required',
            cause: this.integration?.entry_id
              ? 'Home Assistant connection is unavailable.'
              : this.integrationStatus,
            recovery:
              'Check the Home Assistant connection and add or configure the Aviadilo integration in Settings → Devices & services.',
          };
    if (map) {
      if (!resolveAnchor(this.config.map!.anchor, this.state()))
        result.push({
          ...source('Map', JSON.stringify(this.config.map!.anchor)),
          state: 'configuration-required',
          cause: 'Map anchor is unavailable.',
          recovery:
            'Choose a valid home, zone or custom map location in the card editor.',
        });
      const tiles = [...this.basemapTiles.values()];
      result.push(
        external({
          ...source('Basemap', this.discoveryKey ?? 'basemap'),
          state: tiles.includes('unavailable')
            ? 'unavailable'
            : tiles.includes('stale')
              ? 'stale'
              : !tiles.length || tiles.includes('loading')
                ? 'loading'
                : 'current',
          cause: tiles.includes('unavailable')
            ? 'Some visible basemap tiles are unavailable.'
            : tiles.includes('stale')
              ? 'Some visible basemap tiles are retained stale cache data because their source refresh failed.'
              : 'Loading visible basemap tiles.',
          lastSuccess: this.basemapLastSuccess,
        }),
      );
    }
    if (flags.aircraft) {
      const view = this.aircraft?.view(),
        status = this.currentStatuses.aircraft;
      const expired =
        !!view?.fetchedAt &&
        Date.now() - Date.parse(view.fetchedAt) >
          Math.max(60000, (status?.effective_interval_s ?? 10) * 2000);
      result.push(
        external({
          ...source('Aircraft', this.discoveryKey ?? 'aircraft'),
          state:
            expired && (!status || status.state === 'current')
              ? 'stale'
              : (status?.state ?? (view?.fetchedAt ? 'current' : 'loading')),
          cause:
            status?.message ??
            (expired
              ? 'The last aircraft snapshot is stale.'
              : 'Waiting for aircraft data.'),
          lastSuccess: status?.last_success ?? view?.fetchedAt,
        }),
      );
    }
    if (flags.radar) {
      const view = this.radar?.view();
      // A normal loop frame transition retains the prior frame while loading.
      // It is not a source failure unless the load itself exceeds grace.
      const status = this.currentStatuses.radar;
      const failed = status && !['loading', 'current'].includes(status.state);
      const state = failed
        ? status.state
        : !this.radarReady
          ? 'loading'
          : view?.message === 'Loading radar frame'
            ? 'loading'
            : (view?.state ?? 'loading');
      result.push(
        external({
          ...source(
            'Radar',
            `${this.selectionKey}:${this.config.radar!.provider}`,
          ),
          state,
          cause: failed
            ? (status.message ?? `Radar data is ${status.state}.`)
            : !this.radarReady
              ? 'Waiting for radar data for this view.'
              : (view?.message ?? 'Radar data is not current.'),
          lastSuccess: status?.last_success,
          displayedTime: view?.displayedTime,
          ...(state === 'outside-coverage'
            ? {
                recovery:
                  'Recenter within coverage or choose another radar source in the card editor.',
              }
            : {}),
        }),
      );
    }
    if (flags.wind) {
      const view = this.wind?.view();
      result.push(
        external({
          ...source('Wind', this.selectionKey),
          state: view?.status?.state ?? (view?.grid ? 'current' : 'loading'),
          cause:
            view?.status?.message ?? 'Waiting for wind data for this view.',
          lastSuccess: view?.status?.last_success,
          validTime: view?.grid?.valid_time,
          ...(view?.status?.state === 'outside-coverage'
            ? { recovery: 'Recenter within the available model coverage.' }
            : {}),
        }),
      );
    }
    if (map && this.sessionLayers.people) {
      const config = this.config.people!;
      const missing = config.trackers!.some(
        (tracker) => !entityPoint(this.hass?.states[tracker.entity_id]),
      );
      const people = selectPeople(
        { ...config, show_stale: true },
        this.hass,
        this.integration?.area,
      );
      const stale = people.points.some((person) => person.stale);
      result.push({
        ...source(
          'People',
          JSON.stringify([
            config.trackers!.map((tracker) => tracker.entity_id),
            config.anchor,
            config.radius_enabled,
            config.radius_m,
            config.max_age_s,
            config.show_stale,
          ]),
        ),
        state: this.peopleResult.anchorMissing
          ? 'configuration-required'
          : missing
            ? 'unavailable'
            : stale
              ? 'stale'
              : 'current',
        cause: this.peopleResult.anchorMissing
          ? 'People radius anchor is unavailable.'
          : missing
            ? 'A configured tracker has no available location.'
            : 'A tracker location is stale.',
        recovery:
          'Check the configured device trackers, radius anchor and freshness settings in Home Assistant and the card editor.',
      });
    }
    return result;
  }
  private publishState(): void {
    const connection = this.hass?.connection,
      user = this.hass?.user?.id;
    if (
      connection !== this.inspectionConnection ||
      user !== this.inspectionUser
    ) {
      this.stopInspection?.();
      this.stopInspection = undefined;
    }
    this.inspectionConnection = connection;
    this.inspectionUser = user;
    if (!connection) return;
    const radar = this.radar?.view();
    const radarSnapshot: InspectionSnapshot['radar'] = {
      enabled: this.flags().radar,
      config: { ...this.config.radar },
      displayedTime: radar?.displayedTime ?? null,
      state: radar?.state ?? 'loading',
      message: radar?.message ?? null,
      coverage: radar?.manifest?.coverage?.description ?? null,
    };
    if (radarSnapshot.displayedTime) this.lastRadarInspection = radarSnapshot;
    const windTime = this.wind?.view().grid?.valid_time ?? null;
    if (windTime) this.lastWindValidTime = windTime;
    const pausedRadar =
      !this.activeVisible &&
      this.lastRadarInspection &&
      this.lastRadarInspection.config.provider === this.config.radar!.provider
        ? { ...this.lastRadarInspection, enabled: this.flags().radar }
        : radarSnapshot;
    this.stopInspection = publishInspection(connection, {
      owner: this,
      user,
      key: inspectionKey(this.config),
      snapshot: {
        visible: this.activeVisible,
        issues: this.issues,
        radar: pausedRadar,
        wind: {
          enabled: this.flags().wind,
          validTime: this.activeVisible ? windTime : this.lastWindValidTime,
          reducedMotion: this.motionMedia?.matches ?? false,
          mode: this.config.wind!.mode!,
        },
      },
    });
  }
  private attribution() {
    const map = this.config.map!.layout !== 'list';
    const aircraft = this.aircraft?.view();
    const provider =
      this.sessionLayers.aircraft &&
      aircraft?.provider &&
      ((map && this.config.aircraft!.show_map) ||
        (this.config.map!.layout !== 'map' && this.config.aircraft!.show_list))
        ? PROVIDERS[aircraft.provider]
        : null;
    const radar = map && this.flags().radar && this.radar?.view().displayedTime;
    const wind = map && this.flags().wind && this.wind?.view().grid;
    const credits = [
      ...(map
        ? [
            {
              name: '© OpenStreetMap contributors',
              url: 'https://www.openstreetmap.org/copyright',
            },
          ]
        : []),
      ...(provider ? [provider] : []),
      ...(radar
        ? [
            this.config.radar!.provider === 'rainviewer'
              ? { name: 'RainViewer', url: 'https://www.rainviewer.com' }
              : { name: 'NOAA / NWS', url: 'https://www.weather.gov' },
          ]
        : []),
      ...(wind
        ? [{ name: 'DWD ICON-global', url: 'https://www.dwd.de/' }]
        : []),
    ];
    return credits.length
      ? html`<div class="attribution" aria-label="Map data attribution">
          ${credits.map(
            (credit, index) =>
              html`${index ? ' · ' : ''}<a
                  href=${credit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${credit.name}</a
                >`,
          )}
        </div>`
      : '';
  }
  protected render() {
    if (!this.config) return html``;
    this.issues = this.statusTracker.update(this.health());
    const toolbar =
      this.config.map!.show_layer_buttons || this.config.map!.show_recenter;
    return html`<article
      class=${!toolbar &&
      this.issues.length &&
      this.config.map!.layout === 'list'
        ? 'error-only-list'
        : ''}
      data-theme=${resolveTheme(
        this.config.map!.theme,
        this.hass,
        this.themeMedia?.matches ?? false,
      )}
      aria-label="Aviadilo map card"
    >
      ${this.config.title
        ? html`<header><h2>${this.config.title}</h2></header>`
        : ''}
      ${toolbar || this.issues.length
        ? html`<nav
            class=${toolbar ? '' : 'status-overlay'}
            aria-label="Map layers"
          >
            ${this.config.map!.show_layer_buttons
              ? (['aircraft', 'radar', 'wind', 'people'] as const).map(
                  (layer) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(this.sessionLayers[layer])}
                      @click=${() => this.toggle(layer)}
                    >
                      ${layer[0].toUpperCase() + layer.slice(1)}
                    </button>`,
                )
              : ''}${this.config.map!.show_recenter
              ? html`<button type="button" @click=${this.recenter}>
                  Recenter
                </button>`
              : ''}
            ${this.issues.length
              ? html`<div class="status-anchor">
                  <button
                    class="status-indicator"
                    aria-label="Map data needs attention"
                    aria-expanded=${String(this.statusOpen)}
                    aria-controls="map-data-status"
                    aria-haspopup="dialog"
                    @click=${this.toggleStatus}
                  >
                    ⚠
                  </button>
                  ${this.statusOpen
                    ? html`<div
                        id="map-data-status"
                        class="status-popover"
                        popover="manual"
                        role="dialog"
                        aria-modal="false"
                        aria-label="Map data status"
                        tabindex="-1"
                      >
                        <button
                          aria-label="Close status"
                          @click=${() => this.closeStatus(true)}
                        >
                          Close
                        </button>
                        <h3>Map data status</h3>
                        ${issueDetails(this.issues)}
                      </div>`
                    : ''}
                </div>`
              : ''}
          </nav>`
        : ''}
      <div class="map-shell">
        <div
          class=${`map${this.config.map!.layout === 'list' ? ' hidden' : ''}`}
          style=${`height:${this.config.map!.auto_height && this.config.map!.layout !== 'list' ? (this.autoMapHeight ?? this.config.map!.height_px) : this.config.map!.height_px}px`}
          role="region"
          aria-label="Interactive household map"
        ></div>
        ${this.config.map!.layout !== 'list' ? this.attribution() : ''}
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
      ${this.config.map!.layout === 'list' ? this.attribution() : ''}
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
