import { html } from 'lit';
import type { InspectionSnapshot } from '../../data/status';
/** Read-only editor inspection. Saved settings remain in the editor panel. */
export function windInspection(view: InspectionSnapshot['wind']) {
  if (!view.enabled)
    return html`<p>Wind is disabled or not requested in this layout.</p>`;
  return html`<p>
      Wind model valid:
      ${view.validTime
        ? html`<time datetime=${view.validTime}>${view.validTime}</time>`
        : 'Not loaded'}
    </p>
    ${view.mode === 'particles' && view.reducedMotion
      ? html`<p>Reduced motion is enabled: saved particle mode uses arrows.</p>`
      : ''}`;
}
