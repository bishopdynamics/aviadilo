import { LitElement, css, html } from 'lit';
import { normalizeConfig } from './config/defaults';
import type { CardConfig } from './config/types';

declare const __AVIADILO_VERSION__: string;
export const AVIADILO_VERSION = __AVIADILO_VERSION__;

/** Buildable bootstrap only; card picker, editor and map belong to later slices. */
export class AviadiloMap extends LitElement {
  static properties = {
    fixtureSummary: { attribute: false },
    config: { state: true },
  };
  static styles = css`
    :host {
      display: block;
    }
    article {
      border: 1px solid #476078;
      border-radius: 16px;
      padding: 24px;
      background: #192938;
      color: #e6edf5;
    }
    h2 {
      margin-top: 0;
    }
    .status {
      color: #ffc776;
    }
    li {
      margin-block: 8px;
    }
  `;
  declare config: CardConfig;
  declare fixtureSummary: string[];
  constructor() {
    super();
    this.fixtureSummary = [];
  }
  setConfig(value: unknown): void {
    this.config = normalizeConfig(value);
  }
  getCardSize(): number {
    return 4;
  }
  protected render() {
    return html`<article aria-label="Aviadilo development scaffold">
      <h2>${this.config?.title || 'Aviadilo'}</h2>
      <p class="status">Development scaffold · ${AVIADILO_VERSION}</p>
      <p>
        Map rendering, the visual editor and live data are scheduled for later
        slices.
      </p>
      <p>Shared version 1 fixture events:</p>
      <ul>
        ${this.fixtureSummary.map((name) => html`<li>${name}</li>`)}
      </ul>
    </article>`;
  }
}
if (!customElements.get('aviadilo-map'))
  customElements.define('aviadilo-map', AviadiloMap);
