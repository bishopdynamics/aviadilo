import type { CardConfig } from '../config/types';
import { homeBounds, pointBounds, type Point, type Bounds } from './geo';
export interface ViewportMap {
  fitBounds(
    bounds: Bounds,
    options: { maxZoom: number; animate: boolean; padding: [number, number] },
  ): unknown;
}
export class ViewportController {
  private manual = false;
  private lastInteraction = 0;
  private lastBounds = '';
  private initialized = false;
  constructor(private map: ViewportMap) {}
  get suspended(): boolean {
    return this.manual;
  }
  interact(now = Date.now()): void {
    this.manual = true;
    this.lastInteraction = now;
  }
  recenter(): void {
    this.manual = false;
    this.initialized = false;
    this.lastBounds = '';
  }
  update(
    config: NonNullable<CardConfig['map']>,
    home: Point | null,
    points: Point[],
    now = Date.now(),
    resized = false,
  ): void {
    if (
      this.manual &&
      config.idle_return_s != null &&
      now - this.lastInteraction >= config.idle_return_s * 1000
    )
      this.recenter();
    if (
      this.manual ||
      (config.mode === 'home-area' && this.initialized && !resized)
    )
      return;
    const bounds =
      (config.mode === 'fit-visible' ? pointBounds(points) : null) ??
      (home ? homeBounds(home, config.extent_m ?? 100000) : null);
    if (!bounds) return;
    const key = JSON.stringify([bounds, config.max_zoom]);
    if (key === this.lastBounds && !resized) return;
    this.map.fitBounds(bounds, {
      maxZoom: config.max_zoom ?? 18,
      animate: false,
      padding: [32, 32],
    });
    this.lastBounds = key;
    this.initialized = true;
  }
}
