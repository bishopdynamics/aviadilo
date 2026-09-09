import type { CardConfig } from '../config/types';
import type { RadarView } from '../layers/radar/controller';
import type { DataIssue } from '../map/status';

/** Scalars only: no entity records, credentials, image URLs or extra collectors. */
export interface InspectionSnapshot {
  visible: boolean;
  issues: DataIssue[];
  radar: Pick<RadarView, 'config' | 'displayedTime' | 'state' | 'message'> & {
    enabled: boolean;
    coverage: string | null;
  };
  wind: {
    enabled: boolean;
    validTime: string | null;
    reducedMotion: boolean;
    mode: string;
  };
}
export type InspectionResult =
  | { state: 'matched'; snapshot: InspectionSnapshot }
  | { state: 'unavailable' | 'ambiguous' };
export interface InspectionNode {
  parentNode: InspectionNode | null;
  host?: InspectionNode;
}
interface Publication {
  owner: InspectionNode;
  user: string | undefined;
  key: string;
  snapshot: InspectionSnapshot;
}
interface Observer {
  owner: InspectionNode;
  user: string | undefined;
  key: string;
  receive: (result: InspectionResult) => void;
}
interface Scope {
  cards: Map<InspectionNode, Publication>;
  observers: Set<Observer>;
}
const scopes = new WeakMap<object, Scope>();
const LIMIT = 64;
/** Property ordering in user YAML cannot affect matching. */
export function inspectionKey(config: CardConfig): string {
  return JSON.stringify(config, (_, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
function distance(a: InspectionNode, b: InspectionNode): number {
  const ancestors = new Map<InspectionNode, number>();
  let node: InspectionNode | null | undefined = a;
  while (node && !ancestors.has(node)) {
    ancestors.set(node, ancestors.size);
    node = node.parentNode ?? node.host;
  }
  node = b;
  const seen = new Set<InspectionNode>();
  while (node && !seen.has(node)) {
    const depth = ancestors.get(node);
    if (depth !== undefined) return depth + seen.size;
    seen.add(node);
    node = node.parentNode ?? node.host;
  }
  return Infinity;
}
function notify(scope: Scope, observer: Observer): void {
  const matches = [...scope.cards.values()]
    .filter((card) => card.user === observer.user && card.key === observer.key)
    .map((card) => ({ card, distance: distance(observer.owner, card.owner) }))
    .filter((match) => Number.isFinite(match.distance))
    .sort((a, b) => a.distance - b.distance);
  observer.receive(
    !matches.length
      ? { state: 'unavailable' }
      : matches[1]?.distance === matches[0].distance
        ? { state: 'ambiguous' }
        : {
            state: 'matched',
            snapshot: structuredClone(matches[0].card.snapshot),
          },
  );
}
function scopeFor(connection: object): Scope {
  let scope = scopes.get(connection);
  if (!scope) {
    scope = { cards: new Map(), observers: new Set() };
    scopes.set(connection, scope);
  }
  return scope;
}
export function publishInspection(
  connection: object,
  publication: Publication,
): () => void {
  const scope = scopeFor(connection);
  if (!scope.cards.has(publication.owner) && scope.cards.size >= LIMIT)
    return () => {};
  scope.cards.set(publication.owner, publication);
  for (const observer of scope.observers) notify(scope, observer);
  return () => {
    if (scope.cards.get(publication.owner) !== publication) return;
    scope.cards.delete(publication.owner);
    for (const observer of scope.observers) notify(scope, observer);
  };
}
export function observeInspection(
  connection: object,
  observer: Observer,
): () => void {
  const scope = scopeFor(connection);
  if (scope.observers.size >= LIMIT) {
    observer.receive({ state: 'unavailable' });
    return () => {};
  }
  scope.observers.add(observer);
  notify(scope, observer);
  return () => scope.observers.delete(observer);
}
