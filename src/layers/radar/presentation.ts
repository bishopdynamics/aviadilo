import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import noaaLegend from './noaa-legend.png?inline';
import colors from './rainviewer-colors.json';
import type { RadarView } from './controller';

/** Exact scheme-2 rain colors, sampled from the official CSV's first table.
 * https://www.rainviewer.com/files/rainviewer_api_colors_table.csv (2026-09-07).
 * Snow coloring is disabled by the adapter. No remote legend requests.
 */
export function radarLegend(view: Pick<RadarView, 'config'>) {
  return view.config.provider === 'rainviewer'
    ? html`<figure
        aria-label="RainViewer Universal Blue reflectivity in dBZ"
        style="margin:0;max-width:500px"
      >
        <div style="display:flex;height:16px" aria-hidden="true">
          ${colors.map(
            (c) =>
              html`<span
                style=${styleMap({ background: c.color, flex: '1' })}
              ></span>`,
          )}
        </div>
        <figcaption style="position:relative;height:24px">
          ${[-32, 0, 32, 64, 95].map(
            (value) =>
              html`<span
                style=${styleMap({
                  position: 'absolute',
                  left: `${((value + 32) / 127) * 100}%`,
                  transform:
                    value === -32
                      ? 'none'
                      : value === 95
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                })}
                >${value === 95 ? '95 dBZ' : value}</span
              >`,
          )}
        </figcaption>
        <small>Universal Blue · reflectivity · snow coloring off</small>
      </figure>`
    : html`<figure style="margin:0">
        <img
          src=${noaaLegend}
          width="500"
          height="30"
          style="max-width:100%;height:auto"
          alt="NOAA radar reflectivity legend, −20 to 70 dBZ"
        />
        <figcaption>NOAA reflectivity (dBZ)</figcaption>
      </figure>`;
}
