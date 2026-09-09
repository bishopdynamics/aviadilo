import { css, unsafeCSS } from 'lit';
import type { CardConfig } from '../config/types';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
/** Embedded in the card's shadow root and JS bundle; marker imagery is DOM-based. */
export const mapStyles = [
  unsafeCSS(leafletCss),
  css`
    :host {
      display: block;
      min-width: 0;
      --aviadilo-accent: var(--primary-color, #4da3ff);
    }
    article {
      position: relative;
      overflow: hidden;
      color: var(--primary-text-color, #e6edf5);
      background: var(
        --ha-card-background,
        var(--card-background-color, #192938)
      );
      border: var(--ha-card-border-width, 1px) solid
        var(--ha-card-border-color, var(--divider-color, #476078));
      border-radius: var(--ha-card-border-radius, 12px);
      font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
    }
    article.error-only-list {
      min-height: 60px;
    }
    article[data-theme='dark'] {
      --primary-text-color: #e6edf5;
      --card-background-color: #192938;
      --secondary-background-color: #172939;
      --primary-color: #4da3ff;
      --text-primary-color: #102131;
      --divider-color: #476078;
      --aviadilo-accent: #4da3ff;
      color: #e6edf5;
      background: #192938;
    }
    article[data-theme='light'] {
      --primary-text-color: #172939;
      --card-background-color: #ffffff;
      --secondary-background-color: #edf2f6;
      --primary-color: #0867b3;
      --text-primary-color: #ffffff;
      --divider-color: #778b9c;
      --aviadilo-accent: #0867b3;
      color: #172939;
      background: #ffffff;
    }
    article[data-theme='dark'] .leaflet-basemap-pane {
      filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9);
    }
    .map .leaflet-control-zoom a,
    .map .leaflet-control-attribution {
      background: var(--card-background-color);
      color: var(--primary-text-color);
    }
    .leaflet-control-zoom a:hover,
    .leaflet-control-zoom a:focus {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .map .leaflet-control-attribution a {
      color: var(--aviadilo-accent);
    }
    header {
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    h2 {
      font-size: 1.25rem;
      margin: 0;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 12px 16px;
    }
    nav.status-overlay {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 1000;
      padding: 0;
    }
    .status-overlay .status-indicator {
      background: var(--card-background-color);
      box-shadow: 0 2px 6px #0003;
    }
    button {
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #8293a4);
      border-radius: 8px;
      font: inherit;
      background: transparent;
      color: inherit;
    }
    button[aria-pressed='true'] {
      background: var(--aviadilo-accent);
      color: var(--text-primary-color, #fff);
    }
    :focus-visible {
      outline: 3px solid var(--aviadilo-accent);
      outline-offset: 2px;
    }
    .map {
      width: 100%;
      background: var(--secondary-background-color, #172939);
      isolation: isolate;
    }
    .map.hidden {
      display: none;
    }
    .map-shell {
      position: relative;
    }
    .attribution {
      font-size: 10px;
      line-height: 1.5;
      padding: 2px 5px;
      overflow-wrap: anywhere;
      background: var(--card-background-color);
      color: var(--primary-text-color);
    }
    .map-shell > .attribution {
      position: absolute;
      bottom: 0;
      right: 0;
      z-index: 500;
      max-width: calc(100% - 12px);
    }
    .status-popover {
      box-sizing: border-box;
      position: fixed;
      z-index: 1100;
      inset: auto;
      margin: 0;
      width: min(360px, calc(100vw - 24px));
      max-height: min(420px, calc(100dvh - 24px));
      overflow: auto;
      overflow-wrap: anywhere;
      padding: 12px;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      box-shadow: 0 4px 16px #0005;
      font-size: 0.875rem;
    }
    .status-popover h3,
    .status-popover h4 {
      margin: 8px 0;
    }
    .status-popover p {
      margin: 6px 0;
    }
    summary {
      cursor: pointer;
      min-height: 44px;
      line-height: 44px;
    }
    a {
      color: var(--aviadilo-accent);
    }
    .aircraft-list {
      padding: 12px 16px;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .schematic-tile {
      box-sizing: border-box;
      border: 1px solid #52718255;
      background:
        linear-gradient(
          35deg,
          transparent 46%,
          #497c8550 47%,
          #497c8550 50%,
          transparent 51%
        ),
        linear-gradient(90deg, transparent 49%, #54718444 50%, transparent 51%);
      color: #78929f;
    }
    .schematic-tile span {
      padding: 8px;
      font-size: 10px;
    }
    .tile-unavailable {
      display: grid;
      place-items: center;
      color: #758795;
      font-size: 11px;
    }
    .person-marker {
      display: flex;
      width: 36px;
      height: 36px;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 7px #0008;
      color: white;
      font: bold 12px system-ui;
      overflow: hidden;
    }
    .person-marker img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .person-marker.stale {
      opacity: 0.55;
      border-style: dashed;
    }
    .leaflet-tooltip,
    .leaflet-popup-content-wrapper,
    .leaflet-popup-tip {
      color: var(--primary-text-color, #e6edf5);
      background: var(--card-background-color, #192938);
    }
    .leaflet-control-zoom a {
      width: 44px;
      height: 44px;
      line-height: 44px;
    }
    .leaflet-control-attribution {
      max-width: calc(100% - 12px);
      font-size: 10px;
    }
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  `,
];

/** Initial masonry estimate before the DOM is measurable. Sections use natural
 * height instead; expanded disclosures and actual row counts are measured by
 * the card once rendered. Each aircraft row includes its 44px touch target.
 */
export function estimateCardHeight(config?: CardConfig): number {
  const layout = config?.map?.layout ?? 'combined';
  const toolbar =
    config?.map?.show_layer_buttons !== false ||
    config?.map?.show_recenter !== false;
  let height = (toolbar ? 80 : 2) + (config?.title ? 56 : 0);
  if (layout !== 'list') height += config?.map?.height_px ?? 480;
  if (
    layout !== 'map' &&
    config?.layers?.aircraft !== false &&
    config?.aircraft?.show_list !== false
  )
    height += 80 + (config?.aircraft?.list_rows ?? 10) * 52;
  return height;
}
