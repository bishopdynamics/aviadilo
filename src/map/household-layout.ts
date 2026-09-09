/** Pure screen geometry. Coordinates here are presentation only, never fit data. */
export interface ScreenMember {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface HouseholdGroup {
  id: string;
  members: string[];
  x: number;
  y: number;
}
export const LABEL_WIDTH = 144;
export const LABEL_HEIGHT = 128;
const GAP = 8;
export function overlaps(a: ScreenMember, b: ScreenMember): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + GAP &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + GAP
  );
}
export function visibleMembers(
  members: ScreenMember[],
  width: number,
  height: number,
): ScreenMember[] {
  return members
    .filter(
      (p) =>
        p.x + p.width / 2 >= 0 &&
        p.y + p.height / 2 >= 0 &&
        p.x - p.width / 2 <= width &&
        p.y - p.height / 2 <= height,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}
function clamp(
  member: ScreenMember,
  width: number,
  height: number,
): ScreenMember {
  return {
    ...member,
    x: Math.max(
      member.width / 2 + GAP,
      Math.min(width - member.width / 2 - GAP, member.x),
    ),
    y: Math.max(
      member.height / 2 + GAP,
      Math.min(height - member.height / 2 - GAP, member.y),
    ),
  };
}
/** Connected components use stable entity IDs, including the distinct reference ID. */
export function overlapGroups(
  members: ScreenMember[],
  width: number,
  height: number,
): HouseholdGroup[] {
  const points = visibleMembers(members, width, height).map((p) =>
    clamp(p, width, height),
  );
  const pending = new Set(points.map((p) => p.id));
  const groups: HouseholdGroup[] = [];
  for (const seed of points) {
    if (!pending.delete(seed.id)) continue;
    const found = [seed];
    for (let i = 0; i < found.length; i++)
      for (const candidate of points)
        if (pending.has(candidate.id) && overlaps(found[i], candidate)) {
          pending.delete(candidate.id);
          found.push(candidate);
        }
    const ids = found.map((p) => p.id).sort();
    groups.push({
      id: JSON.stringify(ids),
      members: ids,
      x: found.reduce((sum, p) => sum + p.x, 0) / found.length,
      y: found.reduce((sum, p) => sum + p.y, 0) / found.length,
    });
  }
  return groups;
}
/** Bounded deterministic nearest free slot search; a panel is the explicit overflow.
 * The bounded grid costs at most 101 × 1024 candidate probes, each against <=101
 * rectangles. No member is omitted when the available map area is insufficient.
 */
export function spreadMembers(
  members: ScreenMember[],
  width: number,
  height: number,
): {
  positions: ScreenMember[];
  fallback: boolean;
} {
  // The reference remains the visual anchor of its household whenever it fits.
  const ordered = [...members].sort(
    (a, b) =>
      Number(b.id === 'reference') - Number(a.id === 'reference') ||
      a.id.localeCompare(b.id),
  );
  const placed: ScreenMember[] = [];
  for (const member of ordered) {
    if (member.width + 2 * GAP > width || member.height + 2 * GAP > height)
      return { positions: [], fallback: true };
    const origin = clamp(member, width, height);
    const fits = (p: ScreenMember) =>
      !placed.some((other) => overlaps(p, other));
    if (fits(origin)) {
      placed.push(origin);
      continue;
    }
    const distanceOrder = (a: ScreenMember, b: ScreenMember) =>
      Math.hypot(a.x - member.x, a.y - member.y) -
        Math.hypot(b.x - member.x, b.y - member.y) ||
      a.y - b.y ||
      a.x - b.x;
    // Try the nearest clear edges/corners of occupied footprints first. Using
    // both the real anchor and obstacle center keeps ordinary households compact
    // without coupling their placement to the size of the whole viewport.
    const nearby: ScreenMember[] = [];
    for (const other of placed) {
      const dx = (member.width + other.width) / 2 + GAP;
      const dy = (member.height + other.height) / 2 + GAP;
      for (const x of [other.x - dx, other.x + dx])
        for (const y of [origin.y, other.y, other.y - dy, other.y + dy])
          nearby.push(clamp({ ...member, x, y }, width, height));
      for (const y of [other.y - dy, other.y + dy])
        for (const x of [origin.x, other.x])
          nearby.push(clamp({ ...member, x, y }, width, height));
    }
    const local = nearby.sort(distanceOrder).find(fits);
    if (local) {
      placed.push(local);
      continue;
    }
    const candidates: ScreenMember[] = [];
    // A per-member grid spans the entire viewport, capped on very large displays.
    const columns = Math.min(
      32,
      Math.max(1, Math.floor((width - 2 * GAP) / (member.width + GAP))),
    );
    const rows = Math.min(
      32,
      Math.max(1, Math.floor((height - 2 * GAP) / (member.height + GAP))),
    );
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++)
        candidates.push({
          ...member,
          x:
            columns === 1
              ? width / 2
              : GAP +
                member.width / 2 +
                (column * (width - 2 * GAP - member.width)) / (columns - 1),
          y:
            rows === 1
              ? height / 2
              : GAP +
                member.height / 2 +
                (row * (height - 2 * GAP - member.height)) / (rows - 1),
        });
    candidates.sort(distanceOrder);
    const free = candidates.find(fits);
    if (!free) return { positions: [], fallback: true };
    placed.push(free);
  }
  return { positions: placed, fallback: false };
}
