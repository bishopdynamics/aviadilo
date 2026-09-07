import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import noaaLegend from './noaa-legend.png?inline';
import colors from './rainviewer-colors.json';
import type { RadarController, RadarView } from './controller';

/** Exact scheme-2 rain colors, sampled from the official CSV's first table.
 * https://www.rainviewer.com/files/rainviewer_api_colors_table.csv (2026-09-07).
 * Snow coloring is disabled by the adapter. No remote legend requests.
 */
export function radarLegend(view: RadarView) {
  if (!view.config.show_legend) return html``;
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
/** Lit helper for the composing card; no global custom-element registration. */
export function radarTimeline(view: RadarView, controller: RadarController) {
  const rain = view.config.provider === 'rainviewer';
  return html`<section
    aria-label="Radar playback"
    style="display:grid;gap:8px;min-width:0"
  >
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button style="min-height:44px" @click=${() => controller.latest()}>
        Latest
      </button>
      <button
        style="min-height:44px"
        ?disabled=${view.frames.length < 2}
        aria-pressed=${String(view.playing)}
        @click=${() => controller.play(!view.playing)}
      >
        ${view.playing ? 'Pause' : 'Loop'}
      </button>
      <label style="flex:1;min-width:140px"
        >Radar history<input
          style="width:100%;min-height:44px"
          type="range"
          min="0"
          max=${Math.max(0, view.frames.length - 1)}
          step="1"
          .value=${String(Math.max(0, view.index))}
          ?disabled=${!view.frames.length}
          aria-valuetext=${view.frames[view.index]?.time ?? 'No frames'}
          @input=${(e: Event) => {
            controller.play(false);
            controller.seek(Number((e.target as HTMLInputElement).value));
          }}
      /></label>
    </div>
    ${view.config.show_timestamp
      ? html`<div>
          Radar frame:
          ${view.displayedTime
            ? html`<time datetime=${view.displayedTime}
                >${new Date(view.displayedTime).toLocaleString()}</time
              >`
            : 'Not loaded'}
          · Aircraft and people remain live
        </div>`
      : ''}
    <div role="status">
      ${view.state}${view.message ? ` — ${view.message}` : ''}${view.status
        ?.effective_interval_s
        ? ` · metadata every ${view.status.effective_interval_s}s`
        : ''}
    </div>
    ${view.config.show_coverage
      ? html`<small
          >${view.manifest?.coverage?.description ??
          'Coverage detail unavailable. Clear areas may have no radar data.'}</small
        >`
      : ''}
    ${radarLegend(view)}
    <a
      href=${rain ? 'https://www.rainviewer.com' : 'https://www.weather.gov'}
      target="_blank"
      rel="noopener noreferrer"
      >${rain
        ? 'RainViewer'
        : view.config.provider === 'noaa_mrms'
          ? 'NOAA / NWS MRMS'
          : 'NOAA / NWS KSOX'}</a
    >
  </section>`;
}
