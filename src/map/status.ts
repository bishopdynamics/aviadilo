import { html } from 'lit';

export type DataLayer =
  | 'Basemap'
  | 'Map'
  | 'Aircraft'
  | 'Radar'
  | 'Wind'
  | 'People';
export type DataState =
  | 'current'
  | 'loading'
  | 'stale'
  | 'unavailable'
  | 'configuration-required'
  | 'outside-coverage';
export interface LayerHealth {
  layer: DataLayer;
  /** Changes only when requested content changes, never on cosmetic edits. */
  request: string;
  state: DataState;
  cause: string;
  recovery: string;
  lastSuccess?: string | null;
  displayedTime?: string | null;
  validTime?: string | null;
}
export type DataIssue = Omit<LayerHealth, 'request'>;
/** Bounded by six content layers. Initial requests and ongoing loads get grace;
 * disabled requests are removed, while real failures after success surface now. */
export class StatusTracker {
  private requested = new Map<
    DataLayer,
    { key: string; since: number; loadingSince: number | null }
  >();
  update(layers: LayerHealth[], now = Date.now()): DataIssue[] {
    const active = new Set(layers.map((layer) => layer.layer));
    for (const name of this.requested.keys())
      if (!active.has(name)) this.requested.delete(name);
    return layers.flatMap(({ request, ...layer }) => {
      let record = this.requested.get(layer.layer);
      if (!record || record.key !== request) {
        record = { key: request, since: now, loadingSince: null };
        this.requested.set(layer.layer, record);
      }
      const loading = layer.state === 'loading';
      if (loading && record.loadingSince === null) record.loadingSince = now;
      if (!loading) record.loadingSince = null;
      if (
        layer.state === 'current' ||
        now - record.since < 15000 ||
        (record.loadingSince !== null && now - record.loadingSince < 15000)
      )
        return [];
      return [layer];
    });
  }
  clear(): void {
    this.requested.clear();
  }
}
export function issueDetails(issues: readonly DataIssue[]) {
  return issues.map(
    (issue) =>
      html`<section>
        <h4>${issue.layer} · ${issue.state.replaceAll('-', ' ')}</h4>
        <p>${issue.cause}</p>
        ${issue.lastSuccess
          ? html`<p>
              Last success:
              <time datetime=${issue.lastSuccess}>${issue.lastSuccess}</time>
            </p>`
          : ''}
        ${issue.displayedTime
          ? html`<p>
              Displayed radar frame:
              <time datetime=${issue.displayedTime}
                >${issue.displayedTime}</time
              >
            </p>`
          : ''}
        ${issue.validTime
          ? html`<p>
              Model valid:
              <time datetime=${issue.validTime}>${issue.validTime}</time>
            </p>`
          : ''}
        <p>${issue.recovery}</p>
      </section>`,
  );
}
