import { DomUtil, type Map } from 'leaflet';
import { LAYER_PANES } from '../types';
import {
  latitude,
  longitude,
  RadarController,
  type RadarView,
} from './controller';

/** Transparent, noninteractive canvas below targets. Never fits or recenters. */
export class RadarLayer {
  private map?: Map;
  private canvas?: HTMLCanvasElement;
  private unsubscribe?: () => void;
  private attribution = '';
  constructor(private controller: RadarController) {}
  attach(map: Map): void {
    this.dispose();
    this.map = map;
    const pane =
      map.getPane('aviadilo-radar') ?? map.createPane('aviadilo-radar');
    pane.style.zIndex = String(LAYER_PANES.radar);
    pane.style.pointerEvents = 'none';
    this.canvas = DomUtil.create('canvas', 'aviadilo-radar-canvas', pane);
    this.canvas.style.pointerEvents = 'none';
    this.unsubscribe = this.controller.subscribe((view) => this.draw(view));
    map.on('moveend resize', this.viewport);
    map.on('zoomstart', this.hide);
    this.controller.setVisible(true);
    this.viewport();
  }
  private hide = () => {
    if (this.canvas) this.canvas.style.visibility = 'hidden';
  };
  private viewport = () => {
    if (!this.map) return;
    const bounds = this.map.getBounds();
    const normalize = (n: number) => ((((n + 180) % 360) + 360) % 360) - 180;
    const wide = bounds.getEast() - bounds.getWest() >= 360;
    this.controller.setViewport({
      south: Math.max(-85.05112878, bounds.getSouth()),
      north: Math.min(85.05112878, bounds.getNorth()),
      west: wide ? -180 : normalize(bounds.getWest()),
      east: wide ? 180 : normalize(bounds.getEast()),
      zoom: this.map.getZoom(),
    });
    this.draw(this.controller.view());
  };
  private draw(view: RadarView): void {
    const map = this.map,
      canvas = this.canvas;
    if (!map || !canvas) return;
    const attribution = view.visible
      ? view.config.provider === 'rainviewer'
        ? '<a href="https://www.rainviewer.com" target="_blank" rel="noopener noreferrer">RainViewer</a>'
        : '<a href="https://www.weather.gov" target="_blank" rel="noopener noreferrer">NOAA / NWS</a>'
      : '';
    if (attribution !== this.attribution) {
      if (this.attribution)
        map.attributionControl?.removeAttribution(this.attribution);
      if (attribution) map.attributionControl?.addAttribution(attribution);
      this.attribution = attribution;
    }

    const size = map.getSize();
    // At most 8 MiB RGBA, including on large/high-DPI kiosk displays.
    const scale = Math.min(
      1,
      Math.sqrt((2 * 1024 * 1024) / Math.max(1, size.x * size.y)),
    );
    canvas.width = Math.max(1, Math.floor(size.x * scale));
    canvas.height = Math.max(1, Math.floor(size.y * scale));
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    canvas.style.opacity = String(view.config.opacity);
    canvas.style.visibility = view.visible ? '' : 'hidden';
    const origin = map.containerPointToLayerPoint([0, 0]);
    DomUtil.setPosition(canvas, origin);
    const context = canvas.getContext('2d');
    if (!context || !view.visible) return;
    context.scale(scale, scale);
    for (const { tile, image } of view.images) {
      const west = longitude(tile.x, tile.z),
        east = longitude(tile.x + 1, tile.z);
      const north = latitude(tile.y, tile.z),
        south = latitude(tile.y + 1, tile.z);
      const bounds = map.getBounds();
      const first = Math.ceil((bounds.getWest() - east) / 360),
        last = Math.floor((bounds.getEast() - west) / 360);
      for (let wrap = first; wrap <= last; wrap++) {
        const top = map.latLngToContainerPoint([north, west + wrap * 360]);
        const bottom = map.latLngToContainerPoint([south, east + wrap * 360]);
        context.drawImage(
          image,
          top.x,
          top.y,
          bottom.x - top.x,
          bottom.y - top.y,
        );
      }
    }
  }
  fitPoints(): [] {
    return [];
  }
  dispose(): void {
    if (this.attribution)
      this.map?.attributionControl?.removeAttribution(this.attribution);
    this.attribution = '';
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.map?.off('moveend resize', this.viewport);
    this.map?.off('zoomstart', this.hide);
    this.canvas?.remove();
    this.canvas = undefined;
    this.map = undefined;
    this.controller.setVisible(false);
  }
}
