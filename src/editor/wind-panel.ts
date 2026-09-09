import { html } from 'lit';
import defaults from '../../contracts/card-defaults.json';
import type { WindConfig } from '../layers/wind/model';
import type { ConfigPath } from './ha-controls';
/** Mode-specific fields remain saved while hidden; invalid drafts remain editable. */
export function windControls(
  saved: WindConfig,
  edit: (path: ConfigPath, value: unknown) => void,
  draft: (key: string, saved: unknown) => unknown = (_key, value) => value,
) {
  const config = { ...defaults.wind, ...saved };
  const value = (key: keyof typeof config) => draft(key, config[key]);
  const change = (key: string, next: unknown) => edit(['wind', key], next);
  const mode = value('mode');
  return html`<fieldset style="display:grid;gap:8px;min-width:0">
    <legend>Wind</legend>
    <p>Source: DWD ICON-global · 10 m wind</p>
    ${(
      [
        ['mode', 'Display mode', ['arrows', 'barbs', 'particles']],
        ['speed_unit', 'Numeric speed unit', ['km/h', 'mph', 'knots', 'm/s']],
      ] as const
    ).map(
      ([key, label, choices]) =>
        html`<label
          >${label}<select
            id=${`wind-${key}`}
            .value=${String(value(key))}
            @change=${(event: Event) =>
              change(key, (event.target as HTMLSelectElement).value)}
          >
            ${choices.map(
              (choice) =>
                html`<option value=${choice} ?selected=${choice === value(key)}>
                  ${choice}
                </option>`,
            )}
          </select></label
        >`,
    )}
    <label
      >Wind color picker<input
        type="color"
        id="wind-color-picker"
        .value=${/^#[0-9a-fA-F]{6}$/.test(String(value('color')))
          ? String(value('color'))
          : config.color}
        @input=${(event: Event) =>
          change('color', (event.target as HTMLInputElement).value)}
    /></label>
    <label
      >Wind color (hex)<input
        type="text"
        id="wind-color"
        pattern="#[0-9a-fA-F]{6}"
        maxlength="7"
        .value=${String(value('color'))}
        @change=${(event: Event) =>
          change('color', (event.target as HTMLInputElement).value)}
    /></label>
    ${(
      [
        ['marker_spacing_px', 'Marker spacing (px)', 16, 256, 1],
        ['marker_size_px', 'Marker size (px)', 8, 96, 1],
        ['particle_count', 'Particle count', 1, 1500, 1],
        ['animation_speed', 'Animation speed multiplier', 0.1, 5, 0.1],
        ['trail_length_s', 'Trail length (seconds)', 0.1, 10, 0.1],
        ['opacity', 'Opacity', 0, 1, 0.05],
      ] as const
    )
      .filter(
        ([key]) =>
          key === 'opacity' ||
          (key.startsWith('marker_')
            ? mode !== 'particles'
            : mode === 'particles'),
      )
      .map(
        ([key, label, min, max, step]) =>
          html`<label
            >${label}<input
              id=${`wind-${key}`}
              type="number"
              min=${min}
              max=${max}
              step=${step}
              .value=${String(value(key))}
              @change=${(event: Event) =>
                change(key, (event.target as HTMLInputElement).valueAsNumber)}
          /></label>`,
      )}
    <small
      >Arrows point downwind. Barbs point from the wind source; feathers always
      show 5, 10 and 50 knots. Animation adds no forecast detail. Reduced motion
      displays static arrows while keeping Particles saved.</small
    >
  </fieldset>`;
}
