import { describe, expect, it, vi } from 'vitest';
import { ViewportController } from '../../../src/map/viewport';
import {
  pointBounds,
  homeBounds,
  visibleLongitude,
} from '../../../src/map/geo';
const home = { latitude: 34.1, longitude: -117.72 };
const config = { mode: 'fit-visible' as const, extent_m: 100000, max_zoom: 14 };
describe('central viewport', () => {
  it('fits an empty selection home and caps a single point', () => {
    const fitBounds = vi.fn();
    const controller = new ViewportController({ fitBounds });
    controller.update(config, home, []);
    expect(fitBounds.mock.calls[0][0]).toEqual(homeBounds(home, 100000));
    controller.update(config, home, [home]);
    expect(fitBounds.mock.calls[1]).toEqual([
      [
        [home.latitude, home.longitude],
        [home.latitude, home.longitude],
      ],
      { maxZoom: 14, animate: false, padding: [32, 32] },
    ]);
  });
  it('keeps dateline bounds narrow', () => {
    const bounds = pointBounds([
      { latitude: 0, longitude: 179 },
      { latitude: 2, longitude: -179 },
    ])!;
    expect(bounds[1][1] - bounds[0][1]).toBe(2);
  });
  it('holds home-area steady for data updates and deliberately refits resize', () => {
    const fitBounds = vi.fn();
    const controller = new ViewportController({ fitBounds });
    controller.update({ ...config, mode: 'home-area' }, home, []);
    controller.update({ ...config, mode: 'home-area' }, home, [
      { latitude: 0, longitude: 0 },
    ]);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    controller.update({ ...config, mode: 'home-area' }, home, [], 0, true);
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });
  it('preserves manual views through data/resize and recenters explicitly', () => {
    const fitBounds = vi.fn();
    const controller = new ViewportController({ fitBounds });
    controller.update(config, home, [home]);
    controller.interact(100);
    controller.update(config, home, [], 200, true);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    controller.recenter();
    controller.update(config, home, []);
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });
  it('resumes only after configured idle deadline', () => {
    const fitBounds = vi.fn();
    const controller = new ViewportController({ fitBounds });
    controller.interact(100);
    controller.update({ ...config, idle_return_s: 10 }, home, [], 10099);
    expect(fitBounds).not.toHaveBeenCalled();
    controller.update({ ...config, idle_return_s: 10 }, home, [], 10100);
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });
  it('draws both sides of the dateline in the fitted world copy', () => {
    expect(visibleLongitude(-179, 180)).toBe(181);
    expect(visibleLongitude(179, -180)).toBe(-181);
    const bounds = homeBounds({ latitude: 90, longitude: 0 }, 1000);
    expect(bounds[0][0]).toBeLessThanOrEqual(bounds[1][0]);
  });
  it('does not invent a missing home', () => {
    const fitBounds = vi.fn();
    new ViewportController({ fitBounds }).update(config, null, []);
    expect(fitBounds).not.toHaveBeenCalled();
  });
});

it('fit-people follows provided true people points with the existing manual and idle policy', () => {
  const fitBounds = vi.fn();
  const controller = new ViewportController({ fitBounds });
  const people = [{ latitude: 34.12, longitude: -117.74 }];
  const options = { ...config, mode: 'fit-people' as const, idle_return_s: 10 };
  controller.update(options, home, people, 100);
  expect(fitBounds.mock.calls[0][0]).toEqual(pointBounds(people));
  controller.interact(200);
  controller.update(options, home, [], 300, true);
  expect(fitBounds).toHaveBeenCalledTimes(1);
  controller.update(options, home, [], 10200);
  expect(fitBounds.mock.calls[1][0]).toEqual(
    homeBounds(home, options.extent_m),
  );
});
