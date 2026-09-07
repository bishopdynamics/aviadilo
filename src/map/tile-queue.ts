export interface TileJob {
  start: (done: () => void) => void;
  cancelled: boolean;
  cancel?: () => void;
}
/** All card instances share one queue; no prefetch or retry is scheduled here. */
export class TileQueue {
  private queue: TileJob[] = [];
  private active?: TileJob;
  private lastStart = -Infinity;
  private timer?: ReturnType<typeof setTimeout>;
  add(job: TileJob): void {
    this.queue.push(job);
    this.pump();
  }
  cancel(job: TileJob): void {
    job.cancelled = true;
    job.cancel?.();
    this.queue = this.queue.filter((item) => item !== job);
    if (this.active === job) this.active = undefined;
    this.pump();
  }
  private pump(): void {
    if (this.active || this.timer) return;
    while (this.queue[0]?.cancelled) this.queue.shift();
    if (!this.queue.length) return;
    const delay = Math.max(0, 1000 - (Date.now() - this.lastStart));
    if (delay) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, delay);
      return;
    }
    const job = this.queue.shift()!;
    this.active = job;
    this.lastStart = Date.now();
    job.start(() => {
      if (this.active === job) this.active = undefined;
      this.pump();
    });
  }
}
export const basemapQueue = new TileQueue();
