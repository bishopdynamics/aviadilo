import type { Map } from 'leaflet';
import type { Point } from '../map/geo';
/** Layers return filtered point candidates; only the viewport controller fits. */
export interface MapLayer<T> {
  attach(map: Map): void;
  update(value: T): void;
  fitPoints(): Point[];
  dispose(): void;
}
export type LayerName = 'aircraft' | 'radar' | 'wind' | 'people';
export const LAYER_PANES = {
  radar: 250,
  wind: 300,
  context: 350,
  aircraft: 450,
  people: 500,
} as const;
