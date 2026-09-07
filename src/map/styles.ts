import { css, unsafeCSS } from 'lit';
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
    article.fixed-theme {
      --primary-text-color: #e6edf5;
      --card-background-color: #192938;
      --secondary-background-color: #172939;
      --primary-color: #4da3ff;
      --divider-color: #476078;
      --aviadilo-accent: #4da3ff;
      color: #e6edf5;
      background: #192938;
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
      padding: 0 16px 12px;
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
    .status,
    .aircraft-list {
      padding: 12px 16px;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .status p {
      margin: 4px 0;
    }
    .preview-label {
      color: var(--warning-color, #ffc776);
      font-size: 0.8rem;
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
