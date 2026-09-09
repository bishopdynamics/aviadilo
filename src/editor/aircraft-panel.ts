import { html } from 'lit';
import {
  AIRCRAFT_KINDS,
  AIRCRAFT_KIND_LABELS,
  AIRCRAFT_TYPE_HELP,
} from '../layers/aircraft/classification';
import type { AircraftConfig } from '../layers/aircraft/model';
import {
  displayDistance,
  storedDistance,
  type ConfigPath,
} from './ha-controls';

/** Reusable aircraft controls for editor composition; values remain SI in config. */
export function aircraftControls(
  config: AircraftConfig,
  edit: (path: ConfigPath, value: unknown) => void,
) {
  const change = (key: string, value: unknown) =>
    edit(['aircraft', key], value);
  const choices: Record<string, string[]> = {
    distance_unit: ['km', 'mi', 'nmi'],
    altitude_unit: ['m', 'ft'],
    speed_unit: ['km/h', 'mph', 'knots', 'm/s'],
    label_mode: ['off', 'callsign', 'altitude', 'callsign-altitude'],
    sort: ['nearest', 'callsign', 'altitude', 'speed'],
  };
  const label = (key: string) => key.replaceAll('_', ' ');
  return html`<fieldset>
    <legend>Aircraft display</legend>
    <fieldset>
      <legend>Aircraft types</legend>
      <p>${AIRCRAFT_TYPE_HELP}</p>
      ${AIRCRAFT_KINDS.map(
        (kind) =>
          html`<label
            ><input
              type="checkbox"
              .checked=${(config.types ?? AIRCRAFT_KINDS).includes(kind)}
              @change=${(event: Event) => {
                const selected = config.types ?? AIRCRAFT_KINDS;
                change(
                  'types',
                  (event.target as HTMLInputElement).checked
                    ? [...selected, kind]
                    : selected.filter((item) => item !== kind),
                );
              }}
            />${AIRCRAFT_KIND_LABELS[kind]}</label
          >`,
      )}
    </fieldset>
    ${(['show_map', 'show_list', 'airborne_only'] as const).map(
      (key) =>
        html`<label
          ><input
            type="checkbox"
            .checked=${!!config[key]}
            @change=${(event: Event) =>
              change(key, (event.target as HTMLInputElement).checked)}
          />${label(key)}</label
        >`,
    )}
    ${Object.entries(choices).map(
      ([key, options]) =>
        html`<label
          >${label(key)}<select
            .value=${String(config[key])}
            @change=${(event: Event) =>
              change(key, (event.target as HTMLSelectElement).value)}
          >
            ${options.map(
              (option) =>
                html`<option
                  value=${option}
                  ?selected=${option === config[key]}
                >
                  ${option}
                </option>`,
            )}
          </select></label
        >`,
    )}
    ${(['min_altitude_m', 'max_altitude_m', 'max_distance_m'] as const).map(
      (key) => {
        const unit =
          key === 'max_distance_m'
            ? config.distance_unit!
            : config.altitude_unit!;
        return html`<label
          >${label(key).replace(' m', '')} (${unit}; blank disables)<input
            type="number"
            step="any"
            .value=${config[key] == null
              ? ''
              : String(displayDistance(config[key], unit))}
            @change=${(event: Event) => {
              const value = (event.target as HTMLInputElement).value;
              change(
                key,
                value === '' ? null : storedDistance(Number(value), unit),
              );
            }}
        /></label>`;
      },
    )}
    ${(['marker_size_px', 'list_rows', 'selected_trail_s'] as const).map(
      (key) =>
        html`<label
          >${label(key)}<input
            type="number"
            .value=${String(config[key])}
            @change=${(event: Event) =>
              change(key, Number((event.target as HTMLInputElement).value))}
        /></label>`,
    )}
    <label
      >Marker colour<input
        type="text"
        .value=${config.marker_color!}
        @change=${(event: Event) =>
          change('marker_color', (event.target as HTMLInputElement).value)}
    /></label>
    ${(['list_columns', 'detail_fields'] as const).map((key) => {
      const options =
        key === 'list_columns'
          ? [
              'callsign',
              'registration',
              'aircraft_type',
              'altitude',
              'speed',
              'distance',
              'course',
              'squawk',
            ]
          : [
              'callsign',
              'registration',
              'icao',
              'aircraft_type',
              'category',
              'altitude',
              'speed',
              'course',
              'vertical_rate',
              'squawk',
              'position_age',
              'distance',
              'ground',
            ];
      const selected: string[] = config[key] ?? [];
      return html`<fieldset>
        <legend>${label(key)} (selection order)</legend>
        ${options.map(
          (option) =>
            html`<label
              ><input
                type="checkbox"
                .checked=${selected.includes(option)}
                @change=${(event: Event) =>
                  change(
                    key,
                    (event.target as HTMLInputElement).checked
                      ? [...selected, option]
                      : selected.filter((field) => field !== option),
                  )}
              />${label(option)}</label
            >`,
        )}
      </fieldset>`;
    })}
  </fieldset>`;
}
