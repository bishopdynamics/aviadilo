import { expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({ GridLayer: class {} }));
import {
  basemapNativeZoom,
  basemapWorldsPerTile,
} from '../../../src/map/basemap';
it('bounds native tiles for large viewports and overzoom without changing central zoom', () => {
  for (const zoom of [2, 8, 19, 20, 22])
    for (const [width, height] of [
      [900, 600],
      [5000, 4000],
      [16000, 10000],
    ]) {
      const native = basemapNativeZoom(zoom, width, height);
      expect(native).toBeLessThanOrEqual(19);
      expect(native).toBeLessThanOrEqual(zoom);
      const scale = 2 ** (zoom - native);
      if (native > 0)
        expect(
          (Math.ceil(width / (256 * scale)) + 1) *
            (Math.ceil(height / (256 * scale)) + 1),
        ).toBeLessThanOrEqual(96);
    }
  expect(basemapNativeZoom(20, 900, 600)).toBe(19);
  expect(basemapNativeZoom(8, 5000, 4000)).toBeLessThan(8);
});

it('bounds every repeated-world DOM tile even at zoom0 and extreme supported widths', () => {
  for (const zoom of [0, 0.5, 1, 2, 8, 19, 22])
    for (const width of [16000, 24000, 25000, 100000, 10000000]) {
      const height = 2000,
        native = basemapNativeZoom(zoom, width, height);
      const worlds = basemapWorldsPerTile(zoom, width, native);
      const scale = 2 ** (zoom - native);
      const columns = Math.ceil(width / (256 * scale * worlds)) + 1;
      // EPSG3857 clips out-of-world latitude rows (Leaflet _isValidTile).
      const rows = Math.min(2 ** native, Math.ceil(height / (256 * scale)) + 1);
      expect(columns * rows).toBeLessThanOrEqual(96);
      if (worlds > 1) expect(native).toBe(0);
    }
});
