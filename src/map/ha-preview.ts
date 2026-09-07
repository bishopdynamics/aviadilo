/** Isolated HA compatibility boundary: the picker creates cards directly and
 * does not set the documented editor preview flag (frontend 20260826.6).
 * Walk through shadow hosts as well as light-DOM parents; never persist this
 * context in the user's configuration.
 */
export interface ComposedNode {
  readonly localName?: string;
  readonly parentNode?: ComposedNode | null;
  readonly host?: ComposedNode;
}
export function isCardPickerPreview(node: ComposedNode): boolean {
  let cursor: ComposedNode | null | undefined = node;
  while (cursor) {
    if (cursor.localName === 'hui-card-picker') return true;
    cursor = cursor.parentNode ?? cursor.host;
  }
  return false;
}
