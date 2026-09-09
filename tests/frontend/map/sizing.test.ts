import { expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/config/defaults';
import { estimateCardHeight } from '../../../src/map/styles';
const config = normalizeConfig({
  schema_version: 1,
  type: 'custom:aviadilo-map',
});
it('initial masonry estimates include touch-sized list rows and quiet weather overlays', () => {
  const map = { ...config, map: { ...config.map, layout: 'map' as const } };
  expect(estimateCardHeight(map)).toBeGreaterThan(config.map!.height_px!);
  expect(
    estimateCardHeight(config) - estimateCardHeight(map),
  ).toBeGreaterThanOrEqual(config.aircraft!.list_rows! * 44);
  expect(
    estimateCardHeight({
      ...config,
      layers: { aircraft: true, radar: true, wind: true },
    }),
  ).toBe(estimateCardHeight(config));
  expect(
    estimateCardHeight({
      ...config,
      aircraft: { ...config.aircraft, list_rows: 20 },
    }),
  ).toBeGreaterThan(estimateCardHeight(config));
});
it('list-only sizing ignores hidden map and weather settings', () => {
  const list = { ...config, map: { ...config.map, layout: 'list' as const } };
  expect(
    estimateCardHeight({
      ...list,
      map: { ...list.map, height_px: 1000 },
      layers: { ...list.layers, radar: true, wind: true },
    }),
  ).toBe(estimateCardHeight(list));
  expect(
    estimateCardHeight({
      ...config,
      layers: { ...config.layers, aircraft: false },
    }),
  ).toBe(
    estimateCardHeight({
      ...config,
      aircraft: { ...config.aircraft, show_list: false },
    }),
  );
});
