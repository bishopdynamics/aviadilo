import { html } from 'lit';
import type { Anchor } from '../map/geo';
import type { ConfigPath } from './ha-controls';
export function anchorControl(
  value: Anchor | null,
  path: ConfigPath,
  edit: (path: ConfigPath, value: unknown) => void,
  zones: string[],
  nullable: boolean,
) {
  const prefix = path.join('-');
  return html`<fieldset>
    <legend>${nullable ? 'People filter anchor' : 'Map anchor'}</legend>
    <label
      >Location<select
        .value=${value?.kind ?? 'default'}
        @change=${(event: Event) => {
          const kind = (event.target as HTMLSelectElement).value;
          edit(
            path,
            kind === 'default'
              ? null
              : kind === 'home'
                ? { kind }
                : kind === 'zone'
                  ? { kind, entity_id: zones[0] ?? 'zone.home' }
                  : { kind, latitude: 0, longitude: 0 },
          );
        }}
      >
        ${nullable
          ? html`<option value="default" ?selected=${value === null}>
              Integration anchor, then HA home
            </option>`
          : ''}
        <option value="home" ?selected=${value?.kind === 'home'}>
          Home Assistant home
        </option>
        <option value="zone" ?selected=${value?.kind === 'zone'}>Zone</option>
        <option value="custom" ?selected=${value?.kind === 'custom'}>
          Custom coordinates
        </option>
      </select></label
    >
    ${value?.kind === 'zone'
      ? html`<label
          >Zone entity<input
            list=${`${prefix}-zones`}
            .value=${value.entity_id}
            @change=${(e: Event) =>
              edit(
                [...path, 'entity_id'],
                (e.target as HTMLInputElement).value,
              )}
          /><datalist id=${`${prefix}-zones`}>
            ${zones.map((id) => html`<option value=${id}></option>`)}
          </datalist></label
        >`
      : ''}
    ${value?.kind === 'custom'
      ? (['latitude', 'longitude'] as const).map(
          (key) =>
            html`<label
              >${key}<input
                type="number"
                step="any"
                min=${key === 'latitude' ? -90 : -180}
                max=${key === 'latitude' ? 90 : 180}
                .value=${String(value[key])}
                @change=${(e: Event) =>
                  edit(
                    [...path, key],
                    (e.target as HTMLInputElement).valueAsNumber,
                  )}
            /></label>`,
        )
      : ''}
  </fieldset>`;
}
