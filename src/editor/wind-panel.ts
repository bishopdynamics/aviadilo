import { html } from 'lit';
import defaults from '../../contracts/card-defaults.json';
import type { WindConfig } from '../layers/wind/model';
import type { ConfigPath } from './ha-controls';
/** Only one changed path is emitted; the parent preserves all future settings. */
export function windControls(
  saved: WindConfig,
  edit: (path: ConfigPath, value: unknown) => void,
) {
  const config = { ...defaults.wind, ...saved };
  const change = (key: string, value: unknown) => edit(['wind', key], value);
  return html`<fieldset style="display:grid;gap:8px;min-width:0">
    <legend>Wind</legend>
    <label
      >Source<select
        style="min-height:44px"
        @change=${() => change('provider', 'dwd_icon_global')}
      >
        <option value="dwd_icon_global" selected>
          DWD ICON-global · 10 m wind
        </option>
      </select></label
    >
    ${(
      [
        ['static_style', 'Static markers', ['off', 'arrows', 'barbs']],
        ['speed_unit', 'Numeric speed unit', ['km/h', 'mph', 'knots', 'm/s']],
      ] as const
    ).map(
      ([key, label, values]) =>
        html`<label
          >${label}<select
            style="min-height:44px;max-width:100%"
            .value=${config[key]}
            @change=${(e: Event) =>
              change(key, (e.target as HTMLSelectElement).value)}
          >
            ${values.map(
              (value) =>
                html`<option value=${value} ?selected=${value === config[key]}>
                  ${value}
                </option>`,
            )}
          </select></label
        >`,
    )}
    <label style="min-height:44px"
      ><input
        type="checkbox"
        .checked=${config.particles}
        @change=${(e: Event) =>
          change('particles', (e.target as HTMLInputElement).checked)}
      />Animated particles</label
    >
    ${(
      [
        ['marker_spacing_px', 'Marker spacing (px)', 16, 256, 1],
        ['marker_size_px', 'Marker size (px)', 8, 96, 1],
        ['particle_count', 'Particle count', 0, 1500, 1],
        ['animation_speed', 'Animation speed multiplier', 0.1, 5, 0.1],
        ['trail_length_s', 'Trail length (seconds)', 0.1, 10, 0.1],
        ['opacity', 'Opacity', 0, 1, 0.05],
      ] as const
    ).map(
      ([key, label, min, max, step]) =>
        html`<label
          >${label}<input
            style="min-height:44px;max-width:100%;box-sizing:border-box"
            type="number"
            min=${min}
            max=${max}
            step=${step}
            .value=${String(config[key])}
            @change=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              if (input.value !== '' && input.checkValidity())
                change(key, Number(input.value));
            }}
        /></label>`,
    )}
    <small
      >Arrows point downwind. Barbs point from the wind source; feathers always
      show 5, 10 and 50 knots. Animation adds no forecast detail. Reduced motion
      disables particles.</small
    >
  </fieldset>`;
}
