import { describe, expect, it } from 'vitest';
import {
  LABEL_HEIGHT,
  LABEL_WIDTH,
  originalSingletonIds,
  overlapGroups,
  overlaps,
  spreadMembers,
  visibleMembers,
  type ScreenMember,
} from '../../../src/map/household-layout';
const point = (id: string, x = 400, y = 240, labels = false): ScreenMember => ({
  id,
  x,
  y,
  width: labels ? LABEL_WIDTH : 52,
  height: labels ? LABEL_HEIGHT : 52,
});
function expectAccessible(
  members: ScreenMember[],
  width: number,
  height: number,
  protectedIds?: ReadonlySet<string>,
) {
  const layout = spreadMembers(members, width, height, protectedIds);
  expect(layout.fallback).toBe(false);
  expect(layout.positions).toHaveLength(members.length);
  for (const [i, p] of layout.positions.entries()) {
    expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0);
    expect(p.y - p.height / 2).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width / 2).toBeLessThanOrEqual(width);
    expect(p.y + p.height / 2).toBeLessThanOrEqual(height);
    for (const other of layout.positions.slice(i + 1))
      expect(overlaps(p, other)).toBe(false);
  }
  return layout;
}
describe('bounded household screen layout', () => {
  it('reserves a labelled singleton at the old preferred fanout slot before a coincident triple', () => {
    const singleton = point('person.z', 400, 104, true);
    const input = [
      point('person.a', 400, 240, true),
      point('person.b', 400, 240, true),
      point('person.c', 400, 240, true),
      singleton,
    ];
    const before = structuredClone(input);
    const layout = expectAccessible(input, 800, 480);
    expect(originalSingletonIds(input)).toEqual(new Set(['person.z']));
    expect(layout.positions.find((p) => p.id === singleton.id)).toEqual(
      singleton,
    );
    for (let i = 0; i < input.length; i++) {
      const rotated = [...input.slice(i), ...input.slice(0, i)];
      expect(spreadMembers(rotated, 800, 480)).toEqual(layout);
      expect(spreadMembers(rotated.reverse(), 800, 480)).toEqual(layout);
    }
    expect(input).toEqual(before);
  });
  it('protects multiple singletons from multiple groups while keeping a colliding reference anchored', () => {
    const singletons = [
      point('z.left', 250, 164, true),
      point('z.right', 900, 164, true),
    ];
    const input = [
      point('reference', 250, 300),
      point('a.left', 250, 300, true),
      point('b.left', 250, 300, true),
      point('a.right', 900, 300, true),
      point('b.right', 900, 300, true),
      ...singletons,
    ];
    const layout = expectAccessible(input, 1200, 700);
    for (const singleton of singletons)
      expect(layout.positions.find((p) => p.id === singleton.id)).toEqual(
        singleton,
      );
    expect(layout.positions.find((p) => p.id === 'reference')).toEqual(
      input[0],
    );
    expect(spreadMembers([...input].reverse(), 1200, 700)).toEqual(layout);
  });
  it('lets an edge-adjusted isolated reference yield to an in-bounds singleton', () => {
    const input = [point('reference', -10, 200), point('person.z', 60, 200)];
    expect(originalSingletonIds(input)).toEqual(
      new Set(['reference', 'person.z']),
    );
    expect(overlapGroups(input, 800, 480)).toHaveLength(2);
    const layout = expectAccessible(input, 800, 480);
    expect(layout.positions.find((p) => p.id === 'person.z')).toEqual(input[1]);
    expect(
      layout.positions.find((p) => p.id === 'reference')!.x,
    ).toBeGreaterThanOrEqual(34);
  });
  it('protects original singletons when a collapsed or expanded group centroid newly overlaps them', () => {
    const singleton = point('person.z');
    const ring = Array.from({ length: 12 }, (_, i) =>
      point(
        `person.ring_${i}`,
        400 + 100 * Math.cos((i * Math.PI) / 6),
        240 + 100 * Math.sin((i * Math.PI) / 6),
      ),
    );
    const input = [...ring, singleton];
    const protectedIds = originalSingletonIds(input);
    expect(protectedIds).toEqual(new Set(['person.z']));
    const cluster = overlapGroups(input, 800, 480).find(
      (group) => group.members.length > 1,
    )!;
    expect(cluster.members).toHaveLength(12);
    const glyph = {
      id: `group:${cluster.id}`,
      x: cluster.x,
      y: cluster.y,
      width: 56,
      height: 56,
    };
    expect(overlaps(glyph, singleton)).toBe(true);
    for (const members of [
      [singleton, glyph],
      [...input, glyph],
    ]) {
      const layout = expectAccessible(members, 800, 480, protectedIds);
      expect(layout.positions.find((p) => p.id === singleton.id)).toEqual(
        singleton,
      );
      expect(
        spreadMembers([...members].reverse(), 800, 480, protectedIds),
      ).toEqual(layout);
    }
  });
  it('spreads coincident individual markers, including a reference, without mutating true inputs', () => {
    const input = [
      point('person.alex'),
      point('device_tracker.sam'),
      point('reference'),
    ];
    const before = structuredClone(input);
    expectAccessible(input, 800, 480);
    expect(input).toEqual(before);
    expect(overlapGroups(input, 800, 480)[0].members).toEqual([
      'device_tracker.sam',
      'person.alex',
      'reference',
    ]);
  });
  it('uses stable IDs and positions independent of source ordering', () => {
    const input = [point('person.c'), point('person.a'), point('reference')];
    expect(spreadMembers(input, 800, 480)).toEqual(
      spreadMembers([...input].reverse(), 800, 480),
    );
    expect(overlapGroups(input, 800, 480)).toEqual(
      overlapGroups([...input].reverse(), 800, 480),
    );
  });
  it('accounts for bounded label footprints even when icons alone do not touch', () => {
    const input = [
      point('person.a', 250, 220, true),
      point('person.b', 340, 220, true),
    ];
    expect(overlapGroups(input, 800, 480)).toHaveLength(1);
    expectAccessible(input, 800, 480);
  });
  it.each([
    [0, 0],
    [799, 0],
    [0, 479],
    [799, 479],
  ])('keeps a labelled household within the edge at %i,%i', (x, y) => {
    expectAccessible(
      [
        point('a', x, y, true),
        point('b', x, y, true),
        point('reference', x, y),
      ],
      800,
      480,
    );
  });
  it('treats already-wrapped dateline screen neighbors as a single household', () => {
    const input = [point('a', 399), point('b', 401)];
    expect(overlapGroups(input, 800, 480)).toHaveLength(1);
    expectAccessible(input, 800, 480);
  });
  it('includes intersecting edge footprints and excludes entirely offscreen groups', () => {
    const input = [
      point('edge', -10),
      point('away', -400),
      point('otherworld', 20000),
    ];
    expect(visibleMembers(input, 800, 480).map((p) => p.id)).toEqual(['edge']);
    expect(overlapGroups(input, 800, 480)).toHaveLength(1);
  });
  it('provides explicit fallback for 101 markers and constrained views, without partial fans', () => {
    const many = Array.from({ length: 101 }, (_, i) =>
      point(String(i), 200, 80, true),
    );
    expect(spreadMembers(many, 400, 160)).toEqual({
      fallback: true,
      positions: [],
    });
    expect(spreadMembers([point('a', 20, 20, true)], 80, 40)).toEqual({
      fallback: true,
      positions: [],
    });
    expect(overlapGroups(many, 400, 160)[0].members).toHaveLength(101);
  });
  it('has no phantom members after filtering or disabling all layers', () => {
    expect(overlapGroups([], 800, 480)).toEqual([]);
    expect(spreadMembers([], 800, 480)).toEqual({
      fallback: false,
      positions: [],
    });
    expect(overlapGroups([point('reference')], 800, 480)[0].members).toEqual([
      'reference',
    ]);
  });
});

it('anchors the reference and places an ordinary household locally before using the viewport grid', () => {
  const input = [
    point('person.a', 400, 240, true),
    point('person.b', 400, 240, true),
    point('person.c', 400, 240, true),
    point('reference'),
  ];
  const layout = expectAccessible(input, 800, 480);
  expect(layout.positions.find((p) => p.id === 'reference')).toEqual(
    point('reference'),
  );
  for (const p of layout.positions)
    expect(Math.hypot(p.x - 400, p.y - 240)).toBeLessThanOrEqual(160);
  expect(layout).toEqual(spreadMembers(input, 1200, 800));
  expect(layout).toEqual(spreadMembers([...input].reverse(), 800, 480));
});
