import * as L from 'leaflet';
import { type DecodedAssets, type DecodedAsset } from '../data/assets';
const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
/** Conservative worst-alignment visible tile count; native level changes never
 * change the central viewport or the other independent layers. */
export function basemapNativeZoom(
  zoom: number,
  width: number,
  height: number,
): number {
  let native = Math.min(19, Math.max(0, Math.floor(zoom)));
  while (
    native > 0 &&
    (Math.ceil(width / (256 * 2 ** (zoom - native))) + 1) *
      (Math.ceil(height / (256 * 2 ** (zoom - native))) + 1) >
      96
  )
    native--;
  return native;
}
/** At native z0 only one vertical world row is valid. Group very wide world
 * copies into CSS repeats so even a huge view creates <=96 DOM tiles. */
export function basemapWorldsPerTile(
  zoom: number,
  width: number,
  native: number,
): number {
  return native === 0
    ? Math.max(1, Math.ceil(width / (95 * 256 * 2 ** zoom)))
    : 1;
}
class Basemap extends L.GridLayer {
  declare options: L.GridLayerOptions;
  declare protected _removeAllTiles: () => void;
  declare protected _resetView: () => void;
  declare protected _tileZoom?: number;
  declare protected _tileSize?: L.Point;
  redraw(): this {
    if (this._map) {
      // Rebuild GridLayer's cached pixel size/wrapping ranges when resize changes
      // the native level or the number of repeated z0 worlds per DOM tile.
      this._removeAllTiles();
      this._resetView();
    }
    return this;
  }
  private jobs = new Map<HTMLElement, () => void>();
  private unobserve: () => void;
  private uncapacity: () => void;
  private blocked = new Set<() => void>();
  private mounted = false;
  constructor(
    private assets: DecodedAssets,
    private entryId?: string,
  ) {
    super({
      tileSize: 256,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      maxNativeZoom: 19,
      attribution: ATTRIBUTION,
    });
    this.unobserve = assets.client.observe((info) => {
      if (this.mounted) {
        this.cancel();
        if (info) this.redraw();
      }
    });
    this.uncapacity = assets.observeCapacity(() => {
      for (const retry of [...this.blocked]) retry();
    });
    this.on('tileunload', (event: L.TileEvent) => {
      this.jobs.get(event.tile)?.();
      this.jobs.delete(event.tile);
    });
  }
  // Leaflet's native zoom hook runs before each tile range is admitted.
  _clampZoom(zoom: number): number {
    const size = this._map.getSize();
    return basemapNativeZoom(
      Math.min(zoom, this._map.getZoom()),
      size.x,
      size.y,
    );
  }
  getTileSize(): L.Point {
    const size = this._map.getSize(),
      zoom = this._map.getZoom();
    const native = basemapNativeZoom(zoom, size.x, size.y);
    return L.point(256 * basemapWorldsPerTile(zoom, size.x, native), 256);
  }
  protected _update(center?: L.LatLng): void {
    if (!this._map) return;
    // invalidateSize fires moveend before resize. Refresh cached grid geometry
    // BEFORE GridLayer admits tiles using the newly enlarged viewport.
    const native = this._clampZoom(this._map.getZoom());
    if (
      this._tileZoom !== undefined &&
      (this._tileZoom !== native || this._tileSize?.x !== this.getTileSize().x)
    ) {
      this.redraw();
      return;
    }
    (
      L.GridLayer.prototype as L.GridLayer & {
        _update(center?: L.LatLng): void;
      }
    )._update.call(this, center);
  }
  onAdd(map: L.Map): this {
    this.mounted = true;
    return super.onAdd(map);
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('div');
    const repeatWorlds = coords.z === 0 && this.getTileSize().x > 256;
    const controller = new AbortController();
    let held: DecodedAsset | undefined;
    const img = document.createElement('img');
    img.alt = '';
    img.width = img.height = 256;
    const clear = () => {
      if (held) held.signal.removeEventListener('abort', clear);
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      tile.style.backgroundImage = '';
      img.remove();
      held?.release();
      held = undefined;
    };
    this.jobs.set(tile, () => {
      controller.abort();
      this.blocked.delete(load);
      clear();
    });
    const load = () => {
      if (controller.signal.aborted) return;
      this.blocked.delete(load);
      void this.assets
        .acquire(
          {
            kind: 'basemap',
            z: coords.z,
            x: coords.x,
            y: coords.y,
            ...(this.entryId ? { entry_id: this.entryId } : {}),
          },
          controller.signal,
          () => !controller.signal.aborted,
          (error) => {
            if (controller.signal.aborted) return;
            tile.classList.add('tile-unavailable');
            tile.title = error.message;
            tile.textContent = '';
            delete tile.dataset.aviadiloCache;
          },
        )
        .then((asset) => {
          held = asset;
          if (!asset.current() || controller.signal.aborted) {
            clear();
            return;
          }
          asset.signal.addEventListener('abort', clear, { once: true });
          tile.classList.remove('tile-unavailable');
          tile.removeAttribute('title');
          tile.dataset.aviadiloCache = asset.stale ? 'stale' : 'current';
          if (repeatWorlds) {
            tile.replaceChildren();
            tile.style.backgroundImage = `url("${asset.url}")`;
            tile.style.backgroundRepeat = 'repeat-x';
            tile.style.backgroundSize = '256px 256px';
          } else {
            img.src = asset.url;
            tile.replaceChildren(img);
          }
          done(undefined, tile);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (
            error instanceof Error &&
            'localCapacity' in error &&
            error.localCapacity === true
          )
            this.blocked.add(load);
          tile.classList.add('tile-unavailable');
          tile.textContent = '';
          delete tile.dataset.aviadiloCache;
          tile.title =
            error instanceof Error && error.name !== 'AbortError'
              ? error.message
              : 'Asset generation changed';
          done(new Error('Basemap unavailable'), tile);
        });
    };
    load();
    return tile;
  }
  private cancel(): void {
    for (const stop of this.jobs.values()) stop();
    this.jobs.clear();
  }
  onRemove(map: L.Map): this {
    this.mounted = false;
    this.unobserve();
    this.uncapacity();
    this.cancel();
    return super.onRemove(map);
  }
}
export function createBasemap(
  assets: DecodedAssets,
  entryId?: string,
): L.GridLayer {
  return new Basemap(assets, entryId);
}
