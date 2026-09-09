import * as L from 'leaflet';
import { LAYER_PANES } from '../types';
import {
  barbParts,
  hasWindData,
  sampleWind,
  screenVector,
  type Vector,
  type WindController,
  type WindView,
} from './model';
const ATTRIBUTION =
  '<a href="https://www.dwd.de/" target="_blank" rel="noopener noreferrer">DWD ICON-global</a>';
interface Particle {
  x: number;
  y: number;
  age: number;
}
/** Pure static glyph renderer: arrows DOWNWIND, barbs meteorological FROM in knots. */
export function drawWindMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vector: Vector,
  latitude: number,
  style: 'arrows' | 'barbs',
  size: number,
): void {
  const velocity = screenVector(vector, latitude);
  ctx.save();
  ctx.translate(x, y);
  if (
    Math.hypot(vector.u, vector.v) < 0.01 ||
    (style === 'barbs' && barbParts(vector).calm)
  ) {
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.rotate(
    Math.atan2(velocity.y, velocity.x) + (style === 'barbs' ? Math.PI : 0),
  );
  ctx.beginPath();
  ctx.moveTo(-size / 2, 0);
  ctx.lineTo(size / 2, 0);
  if (style === 'arrows') {
    ctx.moveTo(size / 2 - size / 3, -size / 4);
    ctx.lineTo(size / 2, 0);
    ctx.lineTo(size / 2 - size / 3, size / 4);
  } else {
    const parts = barbParts(vector);
    let at = size / 2;
    // Very high speeds remain bounded (input can contain any finite vector).
    for (let i = 0; i < Math.min(parts.flags, 8); i++) {
      ctx.moveTo(at, 0);
      ctx.lineTo(at - size / 8, -size / 2);
      ctx.lineTo(at - size / 4, 0);
      ctx.closePath();
      ctx.fill();
      at -= size / 4;
    }
    for (let i = 0; i < parts.full; i++) {
      ctx.moveTo(at, 0);
      ctx.lineTo(at - size / 5, -size / 2);
      at -= size / 7;
    }
    if (parts.half) {
      ctx.moveTo(at, 0);
      ctx.lineTo(at - size / 10, -size / 4);
    }
  }
  ctx.stroke();
  ctx.restore();
}
export class WindLayer {
  private map?: L.Map;
  private canvases: HTMLCanvasElement[] = [];
  private contexts: CanvasRenderingContext2D[] = [];
  private unsubscribe?: () => void;
  private media?: MediaQueryList;
  private view: WindView;
  private particles: Particle[] = [];
  private raf?: number;
  private last?: number;
  private width = 0;
  private height = 0;
  private scale = 1;
  private attribution = false;
  private moving = false;
  private lifecycle = () => {
    this.stop();
    this.render();
  };
  private moveStart = () => {
    this.moving = true;
    this.stop();
    this.clearCanvases();
  };
  private moveEnd = () => {
    this.moving = false;
    this.lifecycle();
  };
  constructor(
    map: L.Map,
    private controller: WindController,
  ) {
    this.view = controller.view();
    this.attach(map);
  }
  attach(map: L.Map): void {
    this.dispose();
    this.map = map;
    const pane = map.getPane('wind') ?? map.createPane('wind');
    pane.style.zIndex = String(LAYER_PANES.wind);
    pane.style.pointerEvents = 'none';
    for (let i = 0; i < 2; i++) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;pointer-events:none;';
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Wind canvas unavailable');
      pane.append(canvas);
      this.canvases.push(canvas);
      this.contexts.push(ctx);
    }
    this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.media.addEventListener('change', this.lifecycle);
    document.addEventListener('visibilitychange', this.lifecycle);
    map.on('movestart zoomstart', this.moveStart);
    map.on('moveend zoomend resize', this.moveEnd);
    let first = true;
    this.unsubscribe = this.controller.subscribe((view) => {
      const changed =
        first ||
        view.grid !== this.view.grid ||
        view.config !== this.view.config ||
        view.visible !== this.view.visible;
      first = false;
      this.view = view;
      if (changed) this.lifecycle();
    });
  }
  private clearCanvases(): void {
    for (const ctx of this.contexts)
      ctx.clearRect(0, 0, this.width, this.height);
  }
  private render(): void {
    const map = this.map;
    if (!map) return;
    const visible =
      this.view.visible &&
      !document.hidden &&
      !this.moving &&
      map.getContainer().isConnected;
    if (visible !== this.attribution) {
      if (visible) map.attributionControl?.addAttribution(ATTRIBUTION);
      else map.attributionControl?.removeAttribution(ATTRIBUTION);
      this.attribution = visible;
    }
    const size = map.getSize();
    this.width = Math.max(0, size.x);
    this.height = Math.max(0, size.y);
    // Two <=1 megapixel surfaces: <=8 MiB RGBA regardless of screen/device scale.
    this.scale = Math.min(
      1,
      Math.sqrt(1048576 / Math.max(1, this.width * this.height)),
    );
    for (const [i, canvas] of this.canvases.entries()) {
      canvas.hidden = !visible;
      canvas.width = Math.floor(this.width * this.scale);
      canvas.height = Math.floor(this.height * this.scale);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const ctx = this.contexts[i];
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.strokeStyle = this.view.config.color!;
      ctx.shadowColor = '#082638';
      ctx.shadowBlur = 3;
      ctx.fillStyle = this.view.config.color!;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = this.view.config.opacity!;
    }
    const { grid, config } = this.view;
    if (!visible || !grid || !hasWindData(grid) || !this.width || !this.height)
      return;
    const mode =
      config.mode === 'particles' && this.media?.matches
        ? 'arrows'
        : config.mode;
    if (mode === 'arrows' || mode === 'barbs') {
      // Independent of source sampling; bound static work even for giant screens.
      const spacing = Math.max(
        config.marker_spacing_px!,
        Math.sqrt((this.width * this.height) / 4096),
      );
      for (let x = spacing / 2; x < this.width; x += spacing)
        for (let y = spacing / 2; y < this.height; y += spacing) {
          const position = map.containerPointToLatLng([x, y]);
          const vector = sampleWind(grid, position.lat, position.lng);
          if (vector)
            drawWindMarker(
              this.contexts[0],
              x,
              y,
              vector,
              position.lat,
              mode,
              config.marker_size_px!,
            );
        }
    }
    if (mode === 'particles') this.raf = requestAnimationFrame(this.animate);
  }
  private seed(): Particle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      age: 0,
    };
  }
  private animate = (now: number) => {
    this.raf = undefined;
    if (
      !this.map ||
      !this.map.getContainer().isConnected ||
      !this.view.grid ||
      document.hidden ||
      !this.view.visible ||
      this.media?.matches ||
      this.view.config.mode !== 'particles' ||
      this.moving
    ) {
      this.stop();
      return;
    }
    if (this.last === undefined) this.last = now;
    const elapsed = now - this.last;
    if (elapsed >= 1000 / 30) {
      const dt = Math.min(elapsed / 1000, 0.1);
      this.last = now;
      const ctx = this.contexts[1],
        config = this.view.config;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1 - Math.exp(-dt / config.trail_length_s!);
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
      while (this.particles.length < config.particle_count!)
        this.particles.push(this.seed());
      this.particles.length = config.particle_count!;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const position = this.map.containerPointToLatLng([p.x, p.y]);
        const vector = sampleWind(this.view.grid, position.lat, position.lng);
        if (!vector || p.age > 12) {
          this.particles[i] = this.seed();
          continue;
        }
        const velocity = screenVector(vector, position.lat);
        const x = p.x + velocity.x * dt * config.animation_speed! * 2;
        const y = p.y + velocity.y * dt * config.animation_speed! * 2;
        if (x < 0 || x > this.width || y < 0 || y > this.height) {
          this.particles[i] = this.seed();
          continue;
        }
        const next = this.map.containerPointToLatLng([x, y]);
        if (!sampleWind(this.view.grid, next.lat, next.lng)) {
          this.particles[i] = this.seed();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        p.x = x;
        p.y = y;
        p.age += dt;
      }
    }
    this.raf = requestAnimationFrame(this.animate);
  };
  private stop(): void {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
    this.last = undefined;
    this.particles = [];
  }
  diagnostics() {
    return {
      particles: this.particles.length,
      animating: this.raf !== undefined,
      canvasBytes: this.canvases.reduce(
        (n, c) => n + c.width * c.height * 4,
        0,
      ),
    };
  }
  dispose(): void {
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.media?.removeEventListener('change', this.lifecycle);
    this.media = undefined;
    document.removeEventListener('visibilitychange', this.lifecycle);
    this.map?.off('movestart zoomstart', this.moveStart);
    this.map?.off('moveend zoomend resize', this.moveEnd);
    if (this.attribution)
      this.map?.attributionControl?.removeAttribution(ATTRIBUTION);
    this.attribution = false;
    for (const canvas of this.canvases) {
      canvas.remove();
      canvas.width = 0;
      canvas.height = 0;
    }
    this.canvases = [];
    this.contexts = [];
    this.map = undefined;
    this.moving = false;
  }
}
