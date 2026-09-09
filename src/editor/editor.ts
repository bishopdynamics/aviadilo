import { LitElement, css, html } from 'lit';
import schema from '../../contracts/card-config.schema.json';
import { normalizeConfig } from '../config/defaults';
import type { CardConfig } from '../config/types';
import type { HomeAssistant, Anchor } from '../map/geo';
import { label } from '../localize/en';
import { anchorControl } from './map-panel';
import { trackerControls } from './people-panel';
import {
  displayDistance,
  storedDistance,
  readPath,
  editConfig,
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
  };
  declare hass?: HomeAssistant;
  declare private config: CardConfig;
  declare private error: string;
  private readonly draftErrors = new Map<string, string>();
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
    this.draftErrors.clear();
    this.draftValues.clear();
  }
  private edit = (path: ConfigPath, value: unknown): void => {
    try {
      const next = editConfig(this.config, path, value);
      this.config = next;
      this.draftErrors.delete(path.join('.'));
      this.draftValues.delete(path.join('.'));
      this.error = [...this.draftErrors.values()].join(' ');
      this.dispatchEvent(
        new CustomEvent('config-changed', {
          detail: { config: structuredClone(next) },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.draftErrors.set(
        path.join('.'),
        error instanceof Error ? error.message : String(error),
      );
      this.draftValues.set(path.join('.'), value);
      this.error = [...this.draftErrors.values()].join(' ');
    }
  };
  private field(path: ConfigPath, spec: FieldSchema) {
    const key = String(path[path.length - 1]);
    const value = this.draftValues.has(path.join('.'))
      ? this.draftValues.get(path.join('.'))
      : readPath(this.config, path);
    const id = path.join('-');
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
                ${option}
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
            ${Object.entries(fields[panel].properties!).map(([key, spec]) =>
              key === 'anchor'
                ? anchorControl(
                    readPath(this.config, [panel, key]) as Anchor | null,
                    [panel, key],
                    this.edit,
                    entitySuggestions(this.hass?.states, 'zone'),
                    panel === 'people',
                  )
                : key === 'trackers'
                  ? trackerControls(
                      this.config.people!.trackers!,
                      entitySuggestions(this.hass?.states, 'device_tracker'),
                      this.edit,
                    )
                  : this.field([panel, key], spec),
            )}
          </details>`,
      )} `;
  }
}
if (!customElements.get('aviadilo-map-editor'))
  customElements.define('aviadilo-map-editor', AviadiloEditor);
