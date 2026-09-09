import { expect, it, vi } from 'vitest';
import { normalizeConfig } from '../../../src/config/defaults';
import {
  inspectionKey,
  observeInspection,
  publishInspection,
  type InspectionNode,
  type InspectionResult,
  type InspectionSnapshot,
} from '../../../src/data/status';
const config = normalizeConfig({
  type: 'custom:aviadilo-map',
  schema_version: 2,
});
const snapshot: InspectionSnapshot = {
  visible: true,
  issues: [],
  radar: {
    enabled: true,
    config: config.radar!,
    displayedTime: '2026-09-08T00:00:00Z',
    state: 'current',
    message: null,
    coverage: 'Fixture coverage',
  },
  wind: {
    enabled: true,
    mode: 'particles',
    reducedMotion: true,
    validTime: '2026-09-08T01:00:00Z',
  },
};
const node = (
  parentNode: InspectionNode | null = null,
  host?: InspectionNode,
): InspectionNode => ({ parentNode, host });
it('associates through nested shadow roots with the nearest actual card, without any transport calls', () => {
  const connection = { subscribe: vi.fn() },
    root = node(),
    dashboard = node(root),
    dialog = node(root);
  const editor = node(node(null, node(dialog))),
    saved = node(dashboard),
    preview = node(node(null, dialog));
  const receive = vi.fn<(result: InspectionResult) => void>();
  const stop = observeInspection(connection, {
    owner: editor,
    user: 'a',
    key: inspectionKey(config),
    receive,
  });
  const stopSaved = publishInspection(connection, {
    owner: saved,
    user: 'a',
    key: inspectionKey(config),
    snapshot: {
      ...snapshot,
      radar: { ...snapshot.radar, displayedTime: 'saved' },
    },
  });
  const stopPreview = publishInspection(connection, {
    owner: preview,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'matched', snapshot });
  expect(connection.subscribe).not.toHaveBeenCalled();
  stopPreview();
  expect(receive.mock.lastCall?.[0]).toMatchObject({
    state: 'matched',
    snapshot: { radar: { displayedTime: 'saved' } },
  });
  stopSaved();
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'unavailable' });
  stop();
  const count = receive.mock.calls.length;
  publishInspection(connection, {
    owner: saved,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  })();
  expect(receive).toHaveBeenCalledTimes(count);
});
it('does not guess among equal-distance matches or expose another connection, user or config', () => {
  const connection = {},
    root = node(),
    owner = node(root),
    receive = vi.fn();
  const stop = observeInspection(connection, {
    owner,
    user: 'a',
    key: inspectionKey(config),
    receive,
  });
  const wrong = [
    publishInspection(
      {},
      { owner: node(root), user: 'a', key: inspectionKey(config), snapshot },
    ),
    publishInspection(connection, {
      owner: node(root),
      user: 'b',
      key: inspectionKey(config),
      snapshot,
    }),
    publishInspection(connection, {
      owner: node(root),
      user: 'a',
      key: 'other-config',
      snapshot,
    }),
    publishInspection(connection, {
      owner: node(),
      user: 'a',
      key: inspectionKey(config),
      snapshot,
    }),
  ];
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'unavailable' });
  const a = publishInspection(connection, {
    owner: node(root),
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  const b = publishInspection(connection, {
    owner: node(root),
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'ambiguous' });
  b();
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'matched', snapshot });
  a();
  wrong.forEach((clear) => clear());
  stop();
});
it('replaces publication atomically, ignores stale cleanup and returns detached snapshots', () => {
  const connection = {},
    root = node(),
    owner = node(root),
    receive = vi.fn();
  const stop = observeInspection(connection, {
    owner: node(root),
    user: 'a',
    key: inspectionKey(config),
    receive,
  });
  const old = publishInspection(connection, {
    owner,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  const current = publishInspection(connection, {
    owner,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  old();
  const value = receive.mock.lastCall?.[0] as Extract<
    InspectionResult,
    { state: 'matched' }
  >;
  value.snapshot.radar.displayedTime = 'mutated';
  expect(snapshot.radar.displayedTime).toBe('2026-09-08T00:00:00Z');
  current();
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'unavailable' });
  stop();
});
it('matches canonical config independent of property order and bounds retained publishers', () => {
  expect(inspectionKey(config)).toBe(
    inspectionKey({
      ...config,
      radar: Object.fromEntries(Object.entries(config.radar!).reverse()),
    }),
  );
  const connection = {},
    root = node(),
    receive = vi.fn(),
    releases: (() => void)[] = [];
  for (let i = 0; i < 64; i++)
    releases.push(
      publishInspection(connection, {
        owner: node(root),
        user: 'a',
        key: `other-${i}`,
        snapshot,
      }),
    );
  const stop = observeInspection(connection, {
    owner: node(root),
    user: 'a',
    key: inspectionKey(config),
    receive,
  });
  const owner = node(root);
  publishInspection(connection, {
    owner,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'unavailable' });
  releases.pop()!();
  const release = publishInspection(connection, {
    owner,
    user: 'a',
    key: inspectionKey(config),
    snapshot,
  });
  expect(receive.mock.lastCall?.[0]).toEqual({ state: 'matched', snapshot });
  release();
  releases.forEach((clear) => clear());
  stop();
});
