import defaults from '../../../contracts/card-defaults.json';
import type { CardConfig } from '../../config/types';
import type { RadarTile } from '../../data/client';
import type { SnapshotEvent, Viewport } from '../../data/types';

export type RadarConfig = NonNullable<CardConfig['radar']>;
export type RadarManifest = Extract<SnapshotEvent, { kind: 'radar-manifest' }>;
export type RadarStatus = Extract<
  SnapshotEvent,
  { kind: 'status' }
>['statuses'][number];
export interface TileClient {
  loadTile(tile: RadarTile, signal?: AbortSignal): Promise<string>;
  releaseTile(url: string): void;
}
export interface RadarImage {
  tile: RadarTile;
  url: string;
  image: CanvasImageSource;
}
export interface RadarView {
  config: RadarConfig;
  manifest: RadarManifest | null;
  frames: RadarManifest['frames'];
  index: number;
  playing: boolean;
  visible: boolean;
  images: readonly RadarImage[];
  displayedTime: string | null;
  status: RadarStatus | null;
  state: 'loading' | 'current' | 'stale' | 'unavailable' | 'outside-coverage';
  message: string | null;
  bufferedFrames: number;
  decodedBytes: number;
}
interface BufferFrame {
  id: string;
  time: string;
  images: RadarImage[];
}
const MAX_TILES = 32; // 3 * 32 * 256² * 4 = 24 MiB; renderer reserves 8 MiB.
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const longitude = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const latitude = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
function tileY(lat: number, z: number): number {
  const radians = (clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180;
  return clamp(
    Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** z),
    0,
    2 ** z - 1,
  );
}
export function intersects(a: Viewport, b: Viewport): boolean {
  const ranges = (v: Viewport) =>
    v.west <= v.east
      ? [[v.west, v.east]]
      : [
          [v.west, 180],
          [-180, v.east],
        ];
  return (
    a.north > b.south &&
    a.south < b.north &&
    ranges(a).some(([w, e]) => ranges(b).some(([bw, be]) => e > bw && w < be))
  );
}
/** Visible tiles only. Coarsen exceptionally large viewports to a bounded grid. */
export function viewportTiles(
  viewport: Viewport,
  manifest: RadarManifest,
): RadarTile[] {
  for (
    let z = Math.min(
      manifest.native_max_zoom,
      Math.max(0, Math.floor(viewport.zoom)),
    );
    z >= 0;
    z--
  ) {
    const count = 2 ** z;
    const x = (lon: number) =>
      clamp(Math.floor(((lon + 180) / 360) * count), 0, count - 1);
    const ranges =
      viewport.west <= viewport.east
        ? [[x(viewport.west), x(viewport.east)]]
        : [
            [x(viewport.west), count - 1],
            [0, x(viewport.east)],
          ];
    const tiles: RadarTile[] = [];
    const seen = new Set<string>();
    outer: for (const [west, east] of ranges)
      for (let tx = west; tx <= east; tx++)
        for (
          let y = tileY(viewport.north, z);
          y <= tileY(viewport.south, z);
          y++
        ) {
          const bounds = {
            west: longitude(tx, z),
            east: longitude(tx + 1, z),
            north: latitude(y, z),
            south: latitude(y + 1, z),
            zoom: z,
          };
          const key = `${tx}/${y}`;
          if (
            seen.has(key) ||
            !intersects(viewport, bounds) ||
            (manifest.coverage && !intersects(bounds, manifest.coverage.bounds))
          )
            continue;
          seen.add(key);
          tiles.push({
            product: manifest.product,
            frame: '',
            z,
            x: tx,
            y,
            size: 256,
            style: 'default',
          });
          if (tiles.length > MAX_TILES) break outer;
        }
    if (tiles.length <= MAX_TILES) return tiles;
  }
  return [];
}
async function decode(
  url: string,
  signal: AbortSignal,
): Promise<CanvasImageSource> {
  const image = new Image();
  image.src = url;
  const cancel = () => {
    image.src = '';
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await image.decode();
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
    if (image.naturalWidth !== 256 || image.naturalHeight !== 256)
      throw new Error('Invalid radar dimensions');
    return image;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
/** Source selection/HA demand stays with the card; this controller owns rendering work. */
export class RadarController {
  private config: RadarConfig = { ...defaults.radar } as RadarConfig;
  private manifest: RadarManifest | null = null;
  private status: RadarStatus | null = null;
  private viewport?: Viewport;
  private frames: RadarManifest['frames'] = [];
  private index = -1;
  private visible = true;
  private playing = false;
  private followLatest = true;
  private disposed = false;
  private buffer = new Map<string, BufferFrame>();
  private displayed: BufferFrame | null = null;
  private work = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<(view: RadarView) => void>();
  private state: RadarView['state'] = 'loading';
  private message: string | null = null;
  private loading = false;
  constructor(
    private client: TileClient,
    private options: { decode?: typeof decode } = {},
  ) {}
  subscribe(listener: (view: RadarView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view());
    return () => this.listeners.delete(listener);
  }
  configure(config: RadarConfig): void {
    if (this.disposed) return;
    const previous = this.config;
    this.config = { ...defaults.radar, ...config } as RadarConfig;
    if (previous.provider !== this.config.provider) {
      this.reset();
      this.manifest = null;
      this.status = null;
      this.frames = [];
      this.index = -1;
      this.state = 'loading';
      this.message = null;
      this.followLatest = true;
    }
    if (previous.history_minutes !== this.config.history_minutes) {
      this.cancelWork();
      this.selectFrames();
      this.prune();
      void this.show();
    }
    if (previous.mode !== this.config.mode) {
      this.playing = this.config.mode === 'loop';
      this.followLatest = !this.playing;
      if (!this.playing) this.index = this.frames.length - 1;
      void this.show();
    }
    this.schedule();
    this.emit();
  }
  receive(event: SnapshotEvent): void {
    if (this.disposed) return;
    if (event.kind === 'status') {
      this.status =
        event.statuses.find(
          (s) => s.layer === 'radar' && s.provider === this.config.provider,
        ) ?? this.status;
      this.emit();
      return;
    }
    if (
      event.kind !== 'radar-manifest' ||
      event.provider !== this.config.provider
    )
      return;
    const previous = this.manifest;
    const changedIdentity =
      previous &&
      (previous.subscription_id !== event.subscription_id ||
        previous.revision !== event.revision ||
        previous.product !== event.product ||
        previous.native_max_zoom !== event.native_max_zoom);
    if (changedIdentity) this.reset();
    else if (
      previous &&
      JSON.stringify(previous.frames) !== JSON.stringify(event.frames)
    )
      this.cancelWork();
    if (
      previous &&
      JSON.stringify(previous.coverage) !== JSON.stringify(event.coverage)
    )
      this.reset();
    this.manifest = event;
    this.selectFrames();
    this.prune();
    if ((this.followLatest && !this.playing) || !previous)
      this.index = this.frames.length - 1;
    void this.show();
  }
  setViewport(viewport: Viewport): void {
    if (
      this.disposed ||
      JSON.stringify(viewport) === JSON.stringify(this.viewport)
    )
      return;
    this.viewport = { ...viewport };
    this.reset();
    void this.show();
  }
  setVisible(visible: boolean): void {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    if (!visible) this.reset();
    else void this.show();
    this.emit();
  }
  latest(): void {
    this.playing = false;
    this.seek(this.frames.length - 1);
    this.followLatest = true;
  }
  play(value = true): void {
    this.playing = value;
    if (value) this.followLatest = false;
    this.schedule();
    this.emit();
  }
  seek(index: number): void {
    if (this.disposed) return;
    this.followLatest = false;
    this.index = clamp(
      Math.round(index),
      0,
      Math.max(0, this.frames.length - 1),
    );
    this.cancelWork();
    void this.show();
  }
  private selectFrames(): void {
    const current = this.frames[this.index]?.id;
    const frames = [...(this.manifest?.frames ?? [])].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time),
    );
    const cutoff =
      Date.parse(frames.at(-1)?.time ?? '') -
      this.config.history_minutes! * 60000;
    this.frames = frames.filter((f) => Date.parse(f.time) >= cutoff);
    const kept = this.frames.findIndex((f) => f.id === current);
    this.index = kept >= 0 ? kept : this.frames.length - 1;
  }
  private prune(): void {
    const allowed = new Set(this.frames.map((f) => f.id));
    for (const [id, frame] of this.buffer)
      if (!allowed.has(id)) this.release(frame);
    if (this.displayed && !allowed.has(this.displayed.id))
      this.displayed = null;
  }
  private cancelWork(): void {
    this.work.abort();
    this.work = new AbortController();
    this.loading = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private reset(): void {
    this.cancelWork();
    for (const frame of [...this.buffer.values()]) this.release(frame);
    this.displayed = null;
  }
  private release(frame: BufferFrame): void {
    for (const image of frame.images) this.client.releaseTile(image.url);
    this.buffer.delete(frame.id);
  }
  private async load(index: number, signal: AbortSignal): Promise<BufferFrame> {
    const frame = this.frames[index];
    const cached = this.buffer.get(frame.id);
    if (cached) return cached;
    // Reserve room before fetching: client eviction must never invalidate the
    // displayed frame. A candidate plus two retained frames is the hard limit.
    while (this.buffer.size >= 3) {
      const victim = [...this.buffer.values()].find(
        (f) => f !== this.displayed,
      )!;
      this.release(victim);
    }
    const images: RadarImage[] = [];
    try {
      for (const coordinate of viewportTiles(this.viewport!, this.manifest!)) {
        if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
        const tile = { ...coordinate, frame: frame.id };
        const url = await this.client.loadTile(tile, signal);
        try {
          const image = await (this.options.decode ?? decode)(url, signal);
          if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
          images.push({ tile, url, image });
        } catch (error) {
          this.client.releaseTile(url);
          throw error;
        }
      }
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
      const result = { id: frame.id, time: frame.time, images };
      this.buffer.set(frame.id, result);
      return result;
    } catch (error) {
      for (const image of images) this.client.releaseTile(image.url);
      throw error;
    }
  }
  private async show(): Promise<void> {
    if (
      this.loading ||
      this.disposed ||
      !this.visible ||
      !this.viewport ||
      !this.manifest
    ) {
      this.emit();
      return;
    }
    if (!this.frames.length) {
      this.state = 'unavailable';
      this.message = 'No advertised radar frames';
      this.emit();
      return;
    }
    if (
      this.manifest.coverage &&
      !intersects(this.viewport, this.manifest.coverage.bounds)
    ) {
      this.state = 'outside-coverage';
      this.message = this.manifest.coverage.description;
      this.emit();
      return;
    }
    const wanted = this.frames[this.index];
    if (this.displayed?.id === wanted.id) {
      this.schedule();
      this.emit();
      return;
    }
    this.loading = true;
    this.state = this.displayed ? 'stale' : 'loading';
    this.message = 'Loading radar frame';
    this.emit();
    const signal = this.work.signal;
    try {
      const frame = await this.load(this.index, signal);
      if (signal.aborted) return;
      this.displayed = frame;
      this.state = 'current';
      this.message = null;
      this.emit();
      // Only one adjacent frame, after the displayed frame is complete. Static
      // latest mode performs no historical requests.
      if (this.playing && this.frames.length > 1) {
        const next = (this.index + 1) % this.frames.length;
        await this.load(next, signal);
        if (!signal.aborted) this.emit();
      }
      if (!signal.aborted) {
        this.loading = false;
        this.schedule();
      }
    } catch {
      if (signal.aborted) return;
      this.state = this.displayed ? 'stale' : 'unavailable';
      this.message = this.displayed
        ? 'Radar image unavailable. Showing the previous frame.'
        : 'Radar image unavailable.';
      this.playing = false;
      this.loading = false;
      clearTimeout(this.timer);
      this.emit();
    }
  }
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (
      this.disposed ||
      !this.visible ||
      !this.playing ||
      this.loading ||
      this.frames.length < 2
    )
      return;
    this.timer = setTimeout(
      () => this.seek((this.index + 1) % this.frames.length),
      this.config.frame_duration_ms!,
    );
  }
  view(): RadarView {
    const failed =
      this.status && ['stale', 'unavailable'].includes(this.status.state);
    return {
      config: this.config,
      manifest: this.manifest,
      frames: this.frames,
      index: this.index,
      playing: this.playing,
      visible: this.visible,
      images: this.displayed?.images ?? [],
      displayedTime: this.displayed?.time ?? null,
      status: this.status,
      state: failed && this.state === 'current' ? 'stale' : this.state,
      message: this.message ?? this.status?.message ?? null,
      bufferedFrames: this.buffer.size,
      decodedBytes: [...this.buffer.values()].reduce(
        (n, f) => n + f.images.length * 256 * 256 * 4,
        0,
      ),
    };
  }
  private emit(): void {
    const view = this.view();
    for (const listener of this.listeners) listener(view);
  }
  dispose(): void {
    this.disposed = true;
    this.reset();
    this.listeners.clear();
    this.manifest = null;
    this.frames = [];
  }
}
