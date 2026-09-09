import { html } from 'lit';
import type { PeopleConfig } from '../layers/people/model';
import type { ConfigPath } from './ha-controls';
export function trackerControls(
  trackers: NonNullable<PeopleConfig['trackers']>,
  suggestions: string[],
  edit: (path: ConfigPath, value: unknown) => void,
) {
  return html`<fieldset>
    <legend>Selected people and device trackers</legend>
    <p>
      Prefer a person entity to use Home Assistant’s associated trackers. Direct
      device trackers are also supported.
    </p>
    <datalist id="tracker-entities">
      ${suggestions.map((id) => html`<option value=${id}></option>`)}
    </datalist>
    ${trackers.map(
      (tracker, index) =>
        html`<fieldset>
          <legend>Person or tracker ${index + 1}</legend>
          ${(['entity_id', 'name', 'icon', 'color'] as const).map(
            (key) =>
              html`<label
                >${{
                  entity_id: 'Person or device tracker entity',
                  name: 'Name override',
                  icon: 'Icon (mdi:account)',
                  color: 'Colour',
                }[key]}<input
                  list=${key === 'entity_id' ? 'tracker-entities' : ''}
                  .value=${tracker[key] ?? ''}
                  @change=${(event: Event) =>
                    edit(
                      ['people', 'trackers', index, key],
                      (event.target as HTMLInputElement).value,
                    )}
              /></label>`,
          )}<label class="check"
            ><input
              type="checkbox"
              .checked=${!!tracker.show_photo}
              @change=${(event: Event) =>
                edit(
                  ['people', 'trackers', index, 'show_photo'],
                  (event.target as HTMLInputElement).checked,
                )}
            />Show entity photo</label
          ><button
            type="button"
            @click=${() =>
              edit(
                ['people', 'trackers'],
                trackers.filter((_, i) => i !== index),
              )}
          >
            Remove person or tracker ${index + 1}
          </button>
        </fieldset>`,
    )}
    <button
      type="button"
      @click=${() =>
        edit(
          ['people', 'trackers'],
          [
            ...trackers,
            {
              entity_id:
                suggestions.find(
                  (id) => !trackers.some((t) => t.entity_id === id),
                ) ?? 'person.example',
            },
          ],
        )}
    >
      Add person or tracker
    </button>
  </fieldset>`;
}
