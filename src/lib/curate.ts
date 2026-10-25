// Moves for the dev-only curation page (/curate), where Hard Mode's groups
// are arranged by hand. Pure functions over a list of groups, so the page
// and its tests share them. Group 0 is the round opening and always first.

export interface Group {
  key: string; // stable while the page is open, so moves can name groups
  ids: number[];
}

export const OPENING = "opening";

let nextKey = 0;
export const newKey = () => `g${++nextKey}`;

export function toGroups(round: readonly number[], runs: readonly (readonly number[])[]): Group[] {
  return [{ key: OPENING, ids: [...round] }, ...runs.map((ids) => ({ key: newKey(), ids: [...ids] }))];
}

export function fromGroups(groups: readonly Group[]): { round: number[]; runs: number[][] } {
  const [opening, ...rest] = groups;
  return { round: [...opening.ids], runs: rest.map((g) => [...g.ids]).filter((ids) => ids.length) };
}

// Where dropped items go: before `before` in `group` (or at its end), or as a
// new group placed before `newGroupBefore` (or at the very end).
export type ItemTarget = { group: string; before?: number } | { newGroupBefore: string | null };

// Moves `ids` (in the order given) to `target`. Groups left empty disappear,
// except the opening.
export function moveItems(groups: readonly Group[], ids: readonly number[], target: ItemTarget): Group[] {
  const moving = new Set(ids);
  if ("group" in target && target.before !== undefined && moving.has(target.before)) return [...groups];
  let out = groups.map((g) => ({ ...g, ids: g.ids.filter((id) => !moving.has(id)) }));
  if ("group" in target) {
    out = out.map((g) => {
      if (g.key !== target.group) return g;
      const at = target.before === undefined ? g.ids.length : g.ids.indexOf(target.before);
      const next = [...g.ids];
      next.splice(at < 0 ? next.length : at, 0, ...ids);
      return { ...g, ids: next };
    });
  } else {
    const at = target.newGroupBefore === null ? out.length : out.findIndex((g) => g.key === target.newGroupBefore);
    out.splice(Math.max(1, at < 0 ? out.length : at), 0, { key: newKey(), ids: [...ids] });
  }
  return out.filter((g) => g.key === OPENING || g.ids.length);
}

// Moves group `key` before group `before` (or to the end). The opening stays put.
export function moveGroup(groups: readonly Group[], key: string, before: string | null): Group[] {
  if (key === OPENING || key === before) return [...groups];
  const group = groups.find((g) => g.key === key);
  if (!group) return [...groups];
  const out = groups.filter((g) => g.key !== key);
  const at = before === null ? out.length : out.findIndex((g) => g.key === before);
  out.splice(Math.max(1, at < 0 ? out.length : at), 0, group);
  return out;
}

// Ids that sit right next to a relative in the wall these groups make
// (everything in order, group after group).
export function kinNeighbours(groups: readonly Group[], chains: Readonly<Record<string, number>>): Set<number> {
  const order = groups.flatMap((g) => g.ids);
  const out = new Set<number>();
  order.forEach((id, i) => {
    const prev = order[i - 1];
    if (prev !== undefined && chains[id] !== undefined && chains[id] === chains[prev]) {
      out.add(prev);
      out.add(id);
    }
  });
  return out;
}

// Pulls `ids` out of wherever they are into one new group, placed where the
// first of them (in wall order) was. They keep their wall order, except that
// a relative of the one before is pushed further along when possible.
export function gather(
  groups: readonly Group[],
  ids: readonly number[],
  chains: Readonly<Record<string, number>>,
): Group[] {
  const order = groups.flatMap((g) => g.ids);
  const pool = [...new Set(ids)].filter((id) => order.includes(id)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!pool.length) return [...groups];
  const home = groups.find((g) => g.ids.includes(pool[0]))!;
  const kin = (a: number | undefined, b: number) =>
    a !== undefined && chains[a] !== undefined && chains[a] === chains[b];
  const arranged: number[] = [];
  while (pool.length) {
    const k = Math.max(
      0,
      pool.findIndex((id) => !kin(arranged.at(-1), id)),
    );
    arranged.push(...pool.splice(k, 1));
  }
  return moveItems(groups, arranged, { newGroupBefore: home.key });
}
