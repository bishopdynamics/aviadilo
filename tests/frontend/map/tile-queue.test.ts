import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TileQueue, type TileJob } from '../../../src/map/tile-queue';
describe('shared conservative tile queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());
  it('allows only one in-flight tile and spaces starts at least one second', () => {
    const queue = new TileQueue();
    const starts: number[] = [];
    const releases: (() => void)[] = [];
    const job = (): TileJob => ({
      cancelled: false,
      start: (done) => {
        starts.push(Date.now());
        releases.push(done);
      },
    });
    queue.add(job());
    queue.add(job());
    queue.add(job());
    expect(starts).toEqual([0]);
    vi.advanceTimersByTime(2000);
    expect(starts).toEqual([0]);
    releases[0]();
    expect(starts).toEqual([0, 2000]);
    releases[1]();
    vi.advanceTimersByTime(999);
    expect(starts).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(starts).toEqual([0, 2000, 3000]);
    releases[2]();
  });
  it('cancels no-longer-visible queued and active work without retry', () => {
    const queue = new TileQueue();
    const start = vi.fn();
    const cancel = vi.fn();
    const active: TileJob = { cancelled: false, start, cancel };
    const queued: TileJob = { cancelled: false, start };
    queue.add(active);
    queue.add(queued);
    queue.cancel(queued);
    queue.cancel(active);
    vi.advanceTimersByTime(60000);
    expect(start).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('continues other cards after a card cancels its active tile, with pacing intact', () => {
    const queue = new TileQueue();
    const first: TileJob = { cancelled: false, start: vi.fn() };
    const second = { cancelled: false, start: vi.fn() };
    queue.add(first);
    queue.add(second);
    vi.advanceTimersByTime(100);
    queue.cancel(first);
    vi.advanceTimersByTime(899);
    expect(second.start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(second.start).toHaveBeenCalledTimes(1);
  });
});
