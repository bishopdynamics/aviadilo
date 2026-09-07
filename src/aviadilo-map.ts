import { LitElement, html, type PropertyValues } from 'lit';
import * as L from 'leaflet';
import { normalizeConfig } from './config/defaults';
import type { CardConfig } from './config/types';
import { parseInfo } from './data/client';
import type { Info } from './data/types';
import {
  entityPoint,
  resolveAnchor,
  type HomeAssistant,
  type Point,
} from './map/geo';
import { ViewportController } from './map/viewport';
import { createBasemap } from './map/basemap';
import { mapStyles } from './map/styles';
import { previewHass } from './map/preview';
import { isCardPickerPreview } from './map/ha-preview';
import { selectPeople, type PeopleResult } from './layers/people/model';
import { PeopleLayer } from './layers/people/layer';
import { LAYER_PANES, type LayerName } from './layers/types';
import './editor/editor';

declare const __AVIADILO_VERSION__: string;
export const AVIADILO_VERSION = __AVIADILO_VERSION__;
export class AviadiloMap extends LitElement {
  static properties = {
    hass: { attribute: false },
    fixtureHass: { attribute: false },
    preview: { type: Boolean },
    pickerPreview: { state: true },
    config: { state: true },
    sessionLayers: { state: true },
    peopleResult: { state: true },
    integrationStatus: { state: true },
  };
  static styles = mapStyles;
  declare hass?: HomeAssistant;
  declare fixtureHass?: HomeAssistant;
  private readonly syntheticState = previewHass();
  declare preview: boolean;
  declare private pickerPreview: boolean;
  private get effectivePreview(): boolean {
    return this.preview || this.pickerPreview;
  }
  declare config: CardConfig;
  declare private sessionLayers: Record<LayerName, boolean>;
  declare private peopleResult: PeopleResult;
  declare private integrationStatus: string;
  private map?: L.Map;
  private people?: PeopleLayer;
  private basemap?: L.GridLayer;
  private viewport?: ViewportController;
  private resize?: ResizeObserver;
  private interactionListeners?: AbortController;
  private tick?: ReturnType<typeof setInterval>;
  private integration?: Info;
  private discoveryKey?: string;
  private discoveryGeneration = 0;
  private controllerConnection?: HomeAssistant['callWS'];
  private previewMode?: boolean;
  private readonly visibility = () => {
    this.syncBasemap();
    if (!document.hidden) this.refresh();
  };
  constructor() {
    super();
    this.preview = false;
    this.pickerPreview = false;
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
    return Math.ceil(((this.config?.map?.height_px ?? 480) + 150) / 50);
  }
  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      rows: Math.ceil(((this.config?.map?.height_px ?? 480) + 150) / 56),
      min_rows: 4,
    };
  }
  connectedCallback(): void {
    this.pickerPreview = isCardPickerPreview(this);
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.visibility);
    this.tick = setInterval(() => {
      if (!document.hidden) this.refresh();
    }, 1000);
    this.requestUpdate();
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.visibility);
    clearInterval(this.tick);
    this.resize?.disconnect();
    this.interactionListeners?.abort();
    this.people?.dispose();
    this.map?.remove();
    this.map = undefined;
    this.people = undefined;
    this.basemap = undefined;
    this.viewport = undefined;
    this.discoveryGeneration++;
    this.discoveryKey = undefined;
  }
  protected updated(changed: PropertyValues): void {
    if (!this.config || !this.isConnected) return;
    if (!this.map) this.initializeMap();
    if (changed.has('config')) {
      this.viewport?.recenter();
      this.map?.setMinZoom(this.config.map!.min_zoom!);
      this.map?.setMaxZoom(this.config.map!.max_zoom!);
    }
    if (
      changed.has('hass') ||
      changed.has('config') ||
      changed.has('preview') ||
      changed.has('pickerPreview')
    )
      void this.discover();
    if (
      changed.has('config') ||
      changed.has('hass') ||
      changed.has('preview') ||
      changed.has('pickerPreview') ||
      changed.has('sessionLayers') ||
      changed.has('fixtureHass')
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
    if (
      document.hidden ||
      this.config.map!.layout === 'list' ||
      this.previewMode !== this.effectivePreview
    ) {
      this.basemap?.remove();
      this.basemap = undefined;
    }
    if (
      !document.hidden &&
      this.config.map!.layout !== 'list' &&
      !this.basemap
    ) {
      this.basemap = createBasemap(this.effectivePreview).addTo(this.map);
      this.previewMode = this.effectivePreview;
    }
  }
  private async discover(): Promise<void> {
    if (this.effectivePreview) {
      this.discoveryGeneration++;
      this.discoveryKey = undefined;
      this.integration = undefined;
      this.integrationStatus = 'Offline preview';
      return;
    }
    const call = this.hass?.callWS;
    if (!call) return;
    const key = String(this.config.entry_id ?? 'auto');
    if (key === this.discoveryKey && call === this.controllerConnection) return;
    this.controllerConnection = call;
    this.discoveryKey = key;
    this.integration = undefined;
    this.integrationStatus = 'Checking integration';
    const generation = ++this.discoveryGeneration;
    try {
      const info = parseInfo(
        await this.hass!.callWS!({
          type: 'aviadilo/info',
          schema_version: 1,
          entry_id: this.config.entry_id ?? null,
        }),
      );
      if (
        generation !== this.discoveryGeneration ||
        !this.isConnected ||
        this.effectivePreview
      )
        return;
      this.integration = info;
      this.integrationStatus = info.entry_id
        ? 'Integration connected'
        : 'Integration not configured';
    } catch {
      if (generation !== this.discoveryGeneration) return;
      this.integrationStatus =
        'Integration unavailable · people still use Home Assistant';
    }
    this.refresh();
  }
  private state(): HomeAssistant | undefined {
    if (!this.effectivePreview) return this.hass;
    if (this.fixtureHass) return this.fixtureHass;
    const states = { ...this.syntheticState.states };
    for (const [index, tracker] of (
      this.config.people?.trackers ?? []
    ).entries()) {
      states[tracker.entity_id] =
        this.syntheticState.states[
          index % 2 ? 'device_tracker.traveller' : 'device_tracker.synthetic'
        ];
    }
    return { ...this.syntheticState, states };
  }
  private refresh(resized = false): void {
    if (!this.config || !this.map) return;
    const hass = this.state();
    const peopleConfig =
      this.effectivePreview && !this.config.people!.trackers!.length
        ? {
            ...this.config.people,
            trackers: [
              { entity_id: 'device_tracker.synthetic' },
              { entity_id: 'device_tracker.traveller' },
            ],
          }
        : this.config.people!;
    const result = this.sessionLayers.people
      ? selectPeople(peopleConfig, hass, this.integration?.area)
      : { points: [], excluded: 0, anchorMissing: false };
    if (JSON.stringify(result) !== JSON.stringify(this.peopleResult))
      this.peopleResult = result;
    const home = resolveAnchor(this.config.map!.anchor, hass);
    const points: Point[] = [...result.points];
    for (const id of this.config.map!.include_zones!) {
      const zone = entityPoint(hass?.states[id]);
      if (zone) points.push(zone);
    }
    this.viewport?.update(this.config.map!, home, points, Date.now(), resized);
    this.people?.update(result.points, peopleConfig, this.effectivePreview);
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
        ${this.effectivePreview
          ? html`<span class="preview-label">Synthetic · offline preview</span>`
          : ''}
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
        <p>
          ${this.effectivePreview
            ? 'Offline synthetic locations. No provider, tile, photo or backend requests.'
            : this.integrationStatus}
        </p>
        ${(['aircraft', 'radar', 'wind'] as const)
          .filter((layer) => this.sessionLayers[layer])
          .map(
            (layer) =>
              html`<p>
                ${layer[0].toUpperCase() + layer.slice(1)}: rendering pending.
              </p>`,
          )}
      </div>
      ${this.config.map!.layout !== 'map' &&
      this.config.aircraft!.show_list &&
      this.sessionLayers.aircraft
        ? html`<section class="aircraft-list" aria-label="Aircraft list">
            Aircraft list · awaiting aircraft layer implementation.
          </section>`
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
