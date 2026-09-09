import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  aircraftName,
  formatField,
  type AircraftController,
  type AircraftView,
} from './model';

/** Assign .controller; map clicks and row buttons share its selection. */
export class AviadiloAircraftList extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color, #222);
      font: 14px/1.5 sans-serif;
    }
    .scroll {
      overflow: auto;
      max-width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 4px 8px;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid var(--divider-color, #ddd);
    }
    button {
      min-width: 44px;
      min-height: 44px;
      border: 1px solid var(--divider-color, #aaa);
      border-radius: 4px;
      background: var(--card-background-color, #fff);
      color: inherit;
      cursor: pointer;
    }
    button[aria-pressed='true'] {
      outline: 2px solid var(--primary-color, #187bc4);
    }
    .stale {
      opacity: 0.65;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    dt {
      text-transform: capitalize;
    }
    a {
      color: var(--primary-color, #176bb3);
    }
    .detail {
      padding: 8px;
    }
    h3 {
      overflow-wrap: anywhere;
    }
  `;
  private source?: AircraftController;
  private unsubscribe?: () => void;
  private view: AircraftView | null = null;
  set controller(value: AircraftController | undefined) {
    if (value === this.source) return;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.source = value;
    this.connect();
  }
  get controller(): AircraftController | undefined {
    return this.source;
  }
  connectedCallback(): void {
    super.connectedCallback();
    this.connect();
  }
  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    super.disconnectedCallback();
  }
  private connect(): void {
    if (this.isConnected && this.source && !this.unsubscribe)
      this.unsubscribe = this.source.subscribe((view) => {
        this.view = view;
        this.requestUpdate();
      });
    if (!this.source) {
      this.view = null;
      this.requestUpdate();
    }
  }
  protected render() {
    const view = this.view;
    if (!view) return nothing;
    const config = view.config.aircraft!;
    const selected = view.selected;
    return html`
      ${config.show_list
        ? html`<div class="scroll">
            <table aria-label="Aircraft">
              <thead>
                <tr>
                  <th scope="col">Select aircraft</th>
                  ${config.list_columns!.map(
                    (field) =>
                      html`<th scope="col">${field.replaceAll('_', ' ')}</th>`,
                  )}
                </tr>
              </thead>
              <tbody>
                ${repeat(
                  view.rows,
                  (row) => row.aircraft.id,
                  (row) =>
                    html`<tr class=${row.stale ? 'stale' : ''}>
                      <td>
                        <button
                          type="button"
                          aria-pressed=${String(
                            selected?.aircraft.id === row.aircraft.id,
                          )}
                          @click=${() => this.source!.select(row.aircraft.id)}
                        >
                          ${aircraftName(row)}
                        </button>
                      </td>
                      ${config.list_columns!.map(
                        (field) =>
                          html`<td>${formatField(row, field, config)}</td>`,
                      )}
                    </tr>`,
                )}
              </tbody>
            </table>
            ${view.rows.length || !view.fetchedAt
              ? nothing
              : html`<p>No aircraft match the current filters.</p>`}
          </div>`
        : nothing}
      ${selected
        ? html`<section class="detail" aria-label="Selected aircraft">
            <h3>
              ${aircraftName(selected)}${selected.stale
                ? ' · Stale position'
                : ''}
            </h3>
            <button type="button" @click=${() => this.source!.select(null)}>
              Clear selection
            </button>
            <dl>
              ${config.detail_fields!.map(
                (field) =>
                  html`<dt>${field.replaceAll('_', ' ')}</dt>
                    <dd>${formatField(selected, field, config)}</dd>`,
              )}
            </dl>
          </section>`
        : nothing}
    `;
  }
}
if (!customElements.get('aviadilo-aircraft-list'))
  customElements.define('aviadilo-aircraft-list', AviadiloAircraftList);
