import * as L from 'leaflet';
import { visibleLongitude, type Point } from '../../map/geo';
import { LAYER_PANES } from '../types';
import {
  aircraftName,
  formatField,
  PROVIDERS,
  type AircraftController,
  type AircraftRow,
  type AircraftView,
} from './model';
interface MarkerState {
  marker: L.Marker;
  icon: HTMLElement;
  symbol: HTMLElement;
  label: HTMLElement;
  popup: HTMLElement;
}
/** Incremental markers keep open popups and keyboard focus stable. Never fits/pans. */
export class AircraftLayer {
  private group = L.layerGroup();
  private markers = new Map<string, MarkerState>();
  private trail: L.Polyline;
  private unsubscribe: () => void;
  private view: AircraftView | null = null;
  private selectedId: string | null = null;
  private attribution = '';
  private redraw = () => {
    if (this.view) this.render(this.view);
  };
  constructor(
    private map: L.Map,
    private controller: AircraftController,
  ) {
    for (const name of ['aircraft', 'context'] as const) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(LAYER_PANES[name]);
    }
    this.group.addTo(map);
    this.trail = L.polyline([], {
      pane: 'context',
      interactive: false,
      weight: 2,
    }).addTo(this.group);
    this.unsubscribe = controller.subscribe((view) => {
      this.view = view;
      this.render(view);
    });
    map.on('moveend resize', this.redraw);
  }
  private render(view: AircraftView): void {
    const config = view.config.aircraft!;
    const source = view.provider ? PROVIDERS[view.provider] : null;
    const attribution =
      source && config.show_map
        ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.name}</a>`
        : '';
    if (attribution !== this.attribution) {
      if (this.attribution)
        this.map.attributionControl?.removeAttribution(this.attribution);
      if (attribution) this.map.attributionControl?.addAttribution(attribution);
      this.attribution = attribution;
    }
    const center =
      this.map.getZoom() === undefined ? 0 : this.map.getCenter().lng;
    const current = new Set(view.points.map((row) => row.aircraft.id));
    for (const [id, state] of this.markers) {
      if (!current.has(id)) {
        state.marker.off();
        this.group.removeLayer(state.marker);
        this.markers.delete(id);
      }
    }
    for (const row of view.points) {
      const id = row.aircraft.id;
      const selected = view.selected?.aircraft.id === id;
      const position: L.LatLngExpression = [
        row.position!.latitude,
        visibleLongitude(row.position!.longitude, center),
      ];
      let state = this.markers.get(id);
      if (!state) {
        const icon = document.createElement('div');
        const symbol = document.createElement('span');
        const label = document.createElement('span');
        icon.append(symbol, label);
        const popup = document.createElement('div');
        const marker = L.marker(position, {
          pane: 'aircraft',
          keyboard: true,
          autoPanOnFocus: false,
          title: aircraftName(row),
          alt: aircraftName(row),
          icon: L.divIcon({
            html: icon,
            className: 'aviadilo-aircraft-icon',
            iconSize: [config.marker_size_px!, config.marker_size_px!],
          }),
        }).addTo(this.group);
        marker.bindPopup(popup, {
          autoPan: false,
          closeOnClick: false,
          autoClose: false,
        });
        marker.on('click', () => this.controller.select(id));
        state = { marker, icon, symbol, label, popup };
        this.markers.set(id, state);
      }
      state.marker.setLatLng(position);
      state.marker.setOpacity(row.stale ? 0.5 : 1);
      state.icon.style.cssText = `position:relative;width:${config.marker_size_px}px;height:${config.marker_size_px}px;`;
      state.symbol.style.cssText = `display:block;text-align:center;line-height:1;width:100%;height:100%;font-size:${config.marker_size_px}px;transform:rotate(${row.aircraft.course_deg ?? 0}deg);text-shadow:0 0 3px #000;`;
      state.symbol.style.color = config.marker_color!;
      state.symbol.textContent = row.aircraft.course_deg === null ? '●' : '▲';
      state.label.style.cssText =
        'position:absolute;top:100%;left:50%;transform:translateX(-50%);white-space:nowrap;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);padding:2px 4px;border-radius:3px;font-size:12px;';
      const mode = config.label_mode;
      state.label.hidden = mode === 'off';
      state.label.textContent = `${row.stale ? 'Stale · ' : ''}${mode === 'altitude' ? formatField(row, 'altitude', config) : mode === 'callsign-altitude' ? `${aircraftName(row)} · ${formatField(row, 'altitude', config)}` : aircraftName(row)}`;
      const element = state.marker.getElement();
      if (element) {
        element.style.width = `${config.marker_size_px}px`;
        element.style.height = `${config.marker_size_px}px`;
        element.style.marginLeft = `${-config.marker_size_px! / 2}px`;
        element.style.marginTop = `${-config.marker_size_px! / 2}px`;
        element.setAttribute(
          'aria-label',
          `${aircraftName(row)}${row.stale ? ', stale position' : ''}`,
        );
        element.setAttribute('aria-pressed', String(selected));
        element.style.outline = selected ? '2px solid currentColor' : '';
      }
      const previousWidth = state.popup.offsetWidth;
      const previousHeight = state.popup.offsetHeight;
      state.popup.style.width = `${Math.max(1, Math.min(240, this.map.getSize().x - 64))}px`;
      state.popup.style.maxHeight = `${Math.max(60, Math.min(220, this.map.getSize().y / 2 - 70))}px`;
      state.popup.style.overflowY = 'auto';
      state.popup.style.overflowWrap = 'anywhere';
      this.popup(state.popup, row, view);
      if (
        state.marker.isPopupOpen() &&
        (previousWidth !== state.popup.offsetWidth ||
          previousHeight !== state.popup.offsetHeight)
      ) {
        const root = state.popup.getRootNode() as Document | ShadowRoot;
        const focused = root.activeElement;
        const scrollTop = state.popup.scrollTop;
        state.marker.getPopup()?.update();
        state.popup.scrollTop = scrollTop;
        if (focused instanceof HTMLElement && state.popup.contains(focused))
          focused.focus({ preventScroll: true });
      }
      if (selected && this.selectedId !== id) state.marker.openPopup();
      if (!selected && state.marker.isPopupOpen()) state.marker.closePopup();
    }
    this.selectedId = view.selected?.aircraft.id ?? null;
    this.trail.setStyle({ color: config.marker_color });
    this.trail.setLatLngs(
      config.show_map
        ? view.trail.map((p) => [
            p.latitude,
            visibleLongitude(p.longitude, center),
          ])
        : [],
    );
  }
  private popup(root: HTMLElement, row: AircraftRow, view: AircraftView): void {
    const text = `${aircraftName(row)}${row.stale ? ' · Stale position' : ''}\n${view.config.aircraft!.detail_fields!.map((field) => `${field.replaceAll('_', ' ')}: ${formatField(row, field, view.config.aircraft!)}`).join('\n')}`;
    let details = root.querySelector('div');
    if (!details) {
      details = document.createElement('div');
      details.style.whiteSpace = 'pre-line';
      root.append(details);
    }
    if (details.textContent !== text) details.textContent = text;
    if (view.provider && !root.querySelector('a')) {
      const provider = PROVIDERS[view.provider];
      const link = document.createElement('a');
      link.textContent = provider.name;
      link.href = provider.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      root.append(link);
    }
  }
  fitPoints(): Point[] {
    return (
      this.view?.points
        .filter((row) => !row.stale)
        .map((row) => row.position!) ?? []
    );
  }
  dispose(): void {
    if (this.attribution)
      this.map.attributionControl?.removeAttribution(this.attribution);
    this.unsubscribe();
    this.map.off('moveend resize', this.redraw);
    for (const state of this.markers.values()) state.marker.off();
    this.markers.clear();
    this.group.clearLayers();
    this.group.remove();
  }
}
