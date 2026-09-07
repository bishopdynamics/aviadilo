import { html } from 'lit';
import { windControls } from '../../editor/wind-panel';
import type { ConfigPath } from '../../editor/ha-controls';
import { sampleWind, windSpeed, type WindView } from './model';
/** Local graphical settings use the same parent persistence callback as the editor. */
export function windPanel(
  view: WindView,
  edit: (path: ConfigPath, value: unknown) => void,
) {
  const grid = view.grid;
  const vector = grid
    ? sampleWind(
        grid,
        grid.first_latitude + ((grid.height - 1) * grid.latitude_step) / 2,
        grid.first_longitude + ((grid.width - 1) * grid.longitude_step) / 2,
      )
    : null;
  return html`<section aria-label="Wind">
    <p role="status">
      ${view.status?.state ?? (grid ? 'current' : 'loading')}${view.status
        ?.message
        ? ` · ${view.status.message}`
        : ''}
    </p>
    <p>
      <a href="https://www.dwd.de/" target="_blank" rel="noopener noreferrer"
        >DWD ICON-global</a
      >
      · 10 m wind
    </p>
    ${grid
      ? html`<p>
          Model valid:
          <time datetime=${grid.valid_time}>${grid.valid_time}</time
          ><br />${grid.run_time
            ? `Model run: ${grid.run_time}`
            : 'Model run: unknown'}<br />Source resolution:
          ${grid.effective_resolution_deg}°${vector
            ? html`<br />Grid centre speed:
                ${windSpeed(vector, view.config.speed_unit).toFixed(1)}
                ${view.config.speed_unit}`
            : ''}
        </p>`
      : ''}
    ${windControls(view.config, edit)}
  </section>`;
}
