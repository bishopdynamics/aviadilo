import { expect, it } from 'vitest';
import { StatusTracker, type LayerHealth } from '../../../src/map/status';
const layer = (state: LayerHealth['state'], request = 'same'): LayerHealth => ({
  layer: 'Radar',
  request,
  state,
  cause: 'Fixture source',
  recovery: 'Check integration',
  lastSuccess: '2026-09-08T00:00:00Z',
  displayedTime: '2026-09-08T00:00:00Z',
});
it('keeps all initial states quiet for exactly 15 seconds, then exposes error detail', () => {
  for (const state of [
    'loading',
    'stale',
    'unavailable',
    'configuration-required',
    'outside-coverage',
  ] as const) {
    const tracker = new StatusTracker();
    expect(tracker.update([layer(state)], 0)).toEqual([]);
    expect(tracker.update([layer(state)], 14999)).toEqual([]);
    expect(tracker.update([layer(state)], 15000)).toEqual([
      {
        layer: 'Radar',
        state,
        cause: 'Fixture source',
        recovery: 'Check integration',
        lastSuccess: '2026-09-08T00:00:00Z',
        displayedTime: '2026-09-08T00:00:00Z',
      },
    ]);
  }
});
it('healthy content including valid empty aircraft stays quiet and recovery removes errors', () => {
  const tracker = new StatusTracker();
  const aircraft = { ...layer('current'), layer: 'Aircraft' as const };
  expect(tracker.update([aircraft], 0)).toEqual([]);
  expect(tracker.update([aircraft], 60000)).toEqual([]);
  expect(tracker.update([{ ...aircraft, state: 'stale' }], 61000)).toHaveLength(
    1,
  );
  expect(tracker.update([aircraft], 62000)).toEqual([]);
});
it('disabled layers disappear and obsolete viewport failures cannot bypass new request grace', () => {
  const tracker = new StatusTracker();
  tracker.update([layer('unavailable')], 0);
  expect(tracker.update([layer('unavailable')], 16000)).toHaveLength(1);
  expect(tracker.update([], 17000)).toEqual([]);
  expect(tracker.update([layer('unavailable')], 18000)).toEqual([]);
  expect(tracker.update([layer('loading', 'new viewport')], 19000)).toEqual([]);
  expect(tracker.update([layer('current', 'new viewport')], 20000)).toEqual([]);
});
it('normal loop loads get their own grace after healthy rendering but prolonged loads surface', () => {
  const tracker = new StatusTracker();
  tracker.update([layer('current')], 0);
  expect(tracker.update([layer('loading')], 20000)).toEqual([]);
  expect(tracker.update([layer('loading')], 34999)).toEqual([]);
  expect(tracker.update([layer('loading')], 35000)).toHaveLength(1);
  expect(tracker.update([layer('current')], 36000)).toEqual([]);
  expect(tracker.update([layer('loading')], 37000)).toEqual([]);
  expect(tracker.update([layer('stale')], 38000)).toHaveLength(1);
});
