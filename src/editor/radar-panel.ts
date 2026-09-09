import { html } from 'lit';
import defaults from '../../contracts/card-defaults.json';
import type { RadarConfig } from '../layers/radar/controller';
import type { ConfigPath } from './ha-controls';

/** Parent applies only the changed path, preserving future fields and defaults. */
export function radarControls(
  saved: RadarConfig,
  edit: (path: ConfigPath, value: unknown) => void,
) {
  const config = { ...defaults.radar, ...saved };
  const change = (key: string, value: unknown) => edit(['radar', key], value);
  return html`<fieldset style="display:grid;gap:8px;min-width:0">
    <legend>Radar</legend>
    ${(['provider', 'mode'] as const).map(
      (key) =>
        html`<label
          >${key}<select
            style="min-height:44px;max-width:100%"
            .value=${config[key]}
            @change=${(e: Event) =>
              change(key, (e.target as HTMLSelectElement).value)}
          >
            ${(key === 'provider'
              ? ['rainviewer', 'noaa_mrms', 'noaa_ksox']
              : ['latest', 'loop']
            ).map(
              (value) =>
                html`<option value=${value} ?selected=${config[key] === value}>
                  ${value}
                </option>`,
            )}
          </select></label
        >`,
    )}
    ${(
      [
        ['opacity', 0, 1, 0.05],
        ['history_minutes', 1, 1440, 1],
        ['frame_duration_ms', 100, 10000, 100],
      ] as const
    ).map(
      ([key, min, max, step]) =>
        html`<label
          >${key.replaceAll('_', ' ')}<input
            style="min-height:44px;max-width:100%;box-sizing:border-box"
            type="number"
            min=${min}
            max=${max}
            step=${step}
            .value=${String(config[key])}
            @change=${(e: Event) =>
              change(key, Number((e.target as HTMLInputElement).value))}
        /></label>`,
    )}
  </fieldset>`;
}
