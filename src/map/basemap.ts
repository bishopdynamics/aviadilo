import * as L from 'leaflet';
import { basemapQueue, type TileJob } from './tile-queue';
const TILE_ENDPOINT = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
/** Per-page OSM pacing: one image in flight, at least one second between starts. */
class Basemap extends L.GridLayer {
  private jobs = new Map<HTMLElement, TileJob>();
  constructor(private preview: boolean) {
    super({
      tileSize: 256,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      maxNativeZoom: 19,
      attribution: preview
        ? 'Synthetic schematic · offline preview'
        : ATTRIBUTION,
    });
    this.on('tileunload', (event: L.TileEvent) => {
      const job = this.jobs.get(event.tile);
      if (job) {
        basemapQueue.cancel(job);
        this.jobs.delete(event.tile);
      }
    });
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('div');
    if (this.preview) {
      tile.className = 'schematic-tile';
      const label = document.createElement('span');
      label.textContent = `${coords.x} · ${coords.y}`;
      tile.append(label);
      queueMicrotask(() => done(undefined, tile));
      return tile;
    }
    const job: TileJob = {
      cancelled: false,
      start: (release) => {
        if (job.cancelled) {
          release();
          return;
        }
        const img = document.createElement('img');
        img.alt = '';
        img.width = 256;
        img.height = 256;
        img.referrerPolicy = 'strict-origin-when-cross-origin';
        let finished = false;
        const finish = (failed: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          img.onload = null;
          img.onerror = null;
          if (!job.cancelled) {
            if (failed) {
              tile.className = 'tile-unavailable';
              tile.textContent = 'Basemap unavailable';
            }
            done(
              failed ? new Error('Basemap tile unavailable') : undefined,
              tile,
            );
          }
          release();
        };
        const timeout = setTimeout(() => {
          img.removeAttribute('src');
          finish(true);
        }, 15000);
        job.cancel = () => {
          img.removeAttribute('src');
          finish(false);
        };
        img.onload = () => finish(false);
        img.onerror = () => finish(true);
        tile.append(img);
        img.src = L.Util.template(TILE_ENDPOINT, coords);
      },
    };
    this.jobs.set(tile, job);
    basemapQueue.add(job);
    return tile;
  }
  onRemove(map: L.Map): this {
    for (const job of this.jobs.values()) job.cancelled = true;
    for (const job of this.jobs.values()) basemapQueue.cancel(job);
    this.jobs.clear();
    return super.onRemove(map);
  }
}
export function createBasemap(preview: boolean): L.GridLayer {
  return new Basemap(preview);
}
