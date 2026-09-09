import { LitElement, css, html, type PropertyValues } from 'lit';
import {
  inspectionKey,
  observeInspection,
  type InspectionResult,
} from '../data/status';
import { issueDetails } from '../map/status';
import { radarInspection } from './radar-panel';
import { windInspection } from '../layers/wind/controls';
import schema from '../../contracts/card-config.schema.json';
import { normalizeConfig } from '../config/defaults';
import type { CardConfig } from '../config/types';
import type { HomeAssistant, Anchor } from '../map/geo';
import { label } from '../localize/en';
import { anchorControl } from './map-panel';
import { windControls } from './wind-panel';
import { trackerControls } from './people-panel';
import {
  displayDistance,
  storedDistance,
  readPath,
  entitySuggestions,
  type ConfigPath,
} from './ha-controls';
interface FieldSchema {
  type?: string;
  enum?: string[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  items?: FieldSchema;
  anyOf?: FieldSchema[];
  properties?: Record<string, FieldSchema>;
}
const fields = schema.properties as unknown as Record<string, FieldSchema>;
export class AviadiloEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
    error: { state: true },
    inspection: { state: true },
  };
  declare hass?: HomeAssistant;
  declare private config: CardConfig;
  declare private error: string;
  declare private inspection: InspectionResult;
  constructor() {
    super();
    this.inspection = { state: 'unavailable' };
  }
  private stopInspection?: () => void;
  connectedCallback(): void {
    super.connectedCallback();
    this.watchInspection();
  }
  disconnectedCallback(): void {
    this.stopInspection?.();
    this.stopInspection = undefined;
    this.inspection = { state: 'unavailable' };
    super.disconnectedCallback();
  }
  protected updated(changed: PropertyValues): void {
    if (changed.has('hass') || changed.has('config')) this.watchInspection();
  }
  private watchInspection(): void {
    this.stopInspection?.();
    this.stopInspection = undefined;
    if (!this.isConnected || !this.config || !this.hass?.connection) {
      this.inspection = { state: 'unavailable' };
      return;
    }
    this.stopInspection = observeInspection(this.hass.connection, {
      owner: this,
      user: this.hass.user?.id,
      key: inspectionKey(this.config),
      receive: (value) => {
        this.inspection = value;
      },
    });
  }
  private readonly draftValues = new Map<string, unknown>();
  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color, #e6edf5);
      font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
    }
    details,
    fieldset {
      border: 1px solid var(--divider-color, #607182);
      border-radius: 8px;
      margin: 12px 0;
      padding: 12px;
      min-width: 0;
    }
    summary {
      cursor: pointer;
      min-height: 32px;
      font-weight: 600;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin: 10px 0;
    }
    .check {
      flex-direction: row;
      align-items: center;
    }
    input,
    select,
    button {
      box-sizing: border-box;
      font: inherit;
      color: inherit;
      background: var(--secondary-background-color, #192938);
      border: 1px solid var(--divider-color, #8293a4);
      border-radius: 6px;
      padding: 10px;
      min-height: 44px;
      min-width: 0;
      max-width: 100%;
    }
    input[type='checkbox'] {
      width: 24px;
      min-height: 24px;
      accent-color: var(--primary-color, #4da3ff);
    }
    :focus-visible {
      outline: 3px solid var(--primary-color, #4da3ff);
      outline-offset: 2px;
    }
    [role='alert'] {
      color: var(--error-color, #ff9797);
      position: sticky;
      top: 0;
      background: var(--card-background-color, #101923);
      padding: 12px;
    }
    p {
      line-height: 1.5;
    }
  `;
  setConfig(value: unknown): void {
    this.config = normalizeConfig(value);
    this.error = '';
    this.draftValues.clear();
  }
  private draftConfig(): CardConfig {
    const draft = structuredClone(this.config);
    for (const [key, pending] of this.draftValues) {
      const parts = key.split('.');
      let cursor: Record<string, unknown> = draft;
      for (const part of parts.slice(0, -1))
        cursor = cursor[part] as Record<string, unknown>;
      cursor[parts[parts.length - 1]] = pending;
    }
    return draft;
  }
  private edit = (path: ConfigPath, value: unknown): void => {
    const key = path.join('.');
    // Replacing a whole anchor/tracker list supersedes drafts inside it.
    for (const pending of this.draftValues.keys())
      if (pending.startsWith(`${key}.`)) this.draftValues.delete(pending);
    this.draftValues.set(key, value);
    try {
      const draft = this.draftConfig();
      const next = normalizeConfig(draft);
      this.config = next;
      this.draftValues.clear();
      this.error = '';
      this.dispatchEvent(
        new CustomEvent('config-changed', {
          detail: { config: structuredClone(next) },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.requestUpdate();
    }
  };
  private field(path: ConfigPath, spec: FieldSchema) {
    const key = String(path[path.length - 1]);
    const value = this.draftValues.has(path.join('.'))
      ? this.draftValues.get(path.join('.'))
      : readPath(this.config, path);
    const id = path.join('-');
    if (id === 'map-height_px' && this.draftConfig().map!.auto_height)
      return html`<p>
        Height fills the remaining page, with a 160px minimum map. Your fixed
        height is kept for when auto-size is off.
      </p>`;
    if (spec.const !== undefined)
      return html`<p>${label(key)}: ${String(spec.const)}</p>`;
    if (spec.type === 'boolean')
      return html`<label class="check"
        ><input
          type="checkbox"
          .checked=${!!value}
          @change=${(event: Event) =>
            this.edit(path, (event.target as HTMLInputElement).checked)}
        />${label(key)}</label
      >`;
    if (spec.enum)
      return html`<label
        >${label(key)}<select
          .value=${String(value)}
          @change=${(event: Event) =>
            this.edit(path, (event.target as HTMLSelectElement).value)}
        >
          ${spec.enum.map(
            (option) =>
              html`<option value=${option} ?selected=${option === value}>
                ${key === 'theme' && option === 'auto'
                  ? 'Follow Home Assistant'
                  : option}
              </option>`,
          )}
        </select></label
      >`;
    if (spec.type === 'array' && spec.items?.enum)
      return html`<fieldset>
        <legend>${label(key)}</legend>
        ${spec.items.enum.map(
          (option) =>
            html`<label class="check"
              ><input
                type="checkbox"
                .checked=${(value as string[]).includes(option)}
                @change=${(event: Event) =>
                  this.edit(
                    path,
                    (event.target as HTMLInputElement).checked
                      ? [...(value as string[]), option]
                      : (value as string[]).filter((item) => item !== option),
                  )}
              />${label(option)}</label
            >`,
        )}
      </fieldset>`;
    if (spec.type === 'array')
      return html`<label
        >${label(key)} (comma separated)<input
          .value=${(value as string[]).join(', ')}
          @change=${(event: Event) =>
            this.edit(
              path,
              (event.target as HTMLInputElement).value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            )}
      /></label>`;
    const scalar = spec.anyOf?.find((item) => item.type !== 'null') ?? spec;
    const nullable = !!spec.anyOf?.some((item) => item.type === 'null');
    const numeric = scalar.type === 'number' || scalar.type === 'integer';
    let unit = '';
    if (key === 'extent_m') unit = this.config.map!.extent_unit!;
    if (key === 'radius_m') unit = this.config.people!.radius_unit!;
    if (key === 'max_distance_m') unit = this.config.aircraft!.distance_unit!;
    if (key === 'min_altitude_m' || key === 'max_altitude_m')
      unit = this.config.aircraft!.altitude_unit!;
    return html`<label for=${id}
      >${label(key)}${unit ? ` (${unit})` : ''}<input
        id=${id}
        type=${numeric ? 'number' : 'text'}
        step=${scalar.type === 'integer' ? '1' : 'any'}
        min=${scalar.minimum === undefined
          ? ''
          : unit
            ? displayDistance(scalar.minimum, unit)
            : scalar.minimum}
        max=${scalar.maximum === undefined
          ? ''
          : unit
            ? displayDistance(scalar.maximum, unit)
            : scalar.maximum}
        .value=${value == null
          ? ''
          : unit
            ? String(displayDistance(value as number, unit))
            : String(value)}
        @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          this.edit(
            path,
            input.value === '' && nullable
              ? null
              : numeric
                ? input.value === ''
                  ? NaN
                  : unit
                    ? storedDistance(input.valueAsNumber, unit)
                    : input.valueAsNumber
                : input.value,
          );
        }}
    /></label>`;
  }
  protected render() {
    if (!this.config) return html``;
    const draft = this.draftConfig();
    return html`<p>
        Changes update the preview using the same Home Assistant data and
        settings as your dashboard.
      </p>
      ${this.error ? html`<p role="alert">${this.error}</p>` : ''}
      ${this.field(['title'], fields.title)}${this.field(
        ['entry_id'],
        fields.entry_id,
      )}
      ${[
        'map',
        'layers',
        'people',
        'aircraft',
        'radar',
        'wind',
        'freshness',
      ].map(
        (panel) =>
          html`<details ?open=${panel === 'map'}>
            <summary>${label(panel)}</summary>
            ${panel === 'radar'
              ? html`<p>
                  Latest shows the newest radar frame. Loop automatically plays
                  the saved history; aircraft and people remain live.
                </p>`
              : ''}
            ${panel === 'wind'
              ? windControls(this.config.wind!, this.edit, (key, saved) =>
                  this.draftValues.has(`wind.${key}`)
                    ? this.draftValues.get(`wind.${key}`)
                    : saved,
                )
              : Object.entries(fields[panel].properties!).map(([key, spec]) =>
                  key === 'anchor'
                    ? anchorControl(
                        readPath(draft, [panel, key]) as Anchor | null,
                        [panel, key],
                        this.edit,
                        entitySuggestions(this.hass?.states, 'zone'),
                        panel === 'people',
                      )
                    : key === 'trackers'
                      ? trackerControls(
                          draft.people!.trackers!,
                          entitySuggestions(
                            this.hass?.states,
                            'device_tracker',
                          ),
                          this.edit,
                        )
                      : this.field([panel, key], spec),
                )}
          </details>`,
      )}
      <details aria-label="Live inspection">
        <summary>Live inspection</summary>
        <p>
          Read-only state from the matching mounted card. This opens no
          additional data collection.
        </p>
        ${this.inspection.state === 'matched'
          ? html`${!this.inspection.snapshot.visible
              ? html`<p>Card is not visible; data collection is paused.</p>`
              : ''}${radarInspection(this.inspection.snapshot.radar)}
            ${windInspection(this.inspection.snapshot.wind)}
            ${issueDetails(this.inspection.snapshot.issues)}`
          : html`<p>
              ${this.inspection.state === 'ambiguous'
                ? 'More than one equally close matching card is mounted. Inspection is unavailable until a unique card matches.'
                : 'No matching mounted card is available for inspection.'}
            </p>`}
      </details>`;
  }
}
if (!customElements.get('aviadilo-map-editor'))
  customElements.define('aviadilo-map-editor', AviadiloEditor);
