import { describe, expect, it } from "vitest";
import { OPENING, fromGroups, gather, kinNeighbours, moveGroup, moveItems, toGroups } from "../lib/curate";

const board = () => toGroups([1, 2], [[3, 4, 5], [6, 7], [8]]);
const ids = (groups: ReturnType<typeof board>) => groups.map((g) => g.ids);

describe("curation moves", () => {
  it("moves items within a group and across groups", () => {
    const g = board();
    expect(ids(moveItems(g, [5], { group: g[1].key, before: 3 }))).toEqual([[1, 2], [5, 3, 4], [6, 7], [8]]);
    expect(ids(moveItems(g, [3, 6], { group: g[3].key }))).toEqual([[1, 2], [4, 5], [7], [8, 3, 6]]);
    expect(ids(moveItems(g, [4], { group: OPENING, before: 2 }))).toEqual([[1, 4, 2], [3, 5], [6, 7], [8]]);
  });

  it("drops groups that empty out, but never the opening", () => {
    const g = board();
    expect(ids(moveItems(g, [8], { group: g[1].key }))).toEqual([
      [1, 2],
      [3, 4, 5, 8],
      [6, 7],
    ]);
    expect(ids(moveItems(g, [1, 2], { group: g[3].key }))).toEqual([[], [3, 4, 5], [6, 7], [8, 1, 2]]);
  });

  it("starts a new group between others, never ahead of the opening", () => {
    const g = board();
    expect(ids(moveItems(g, [4, 7], { newGroupBefore: g[2].key }))).toEqual([[1, 2], [3, 5], [4, 7], [6], [8]]);
    expect(ids(moveItems(g, [3], { newGroupBefore: OPENING }))).toEqual([[1, 2], [3], [4, 5], [6, 7], [8]]);
    expect(ids(moveItems(g, [3], { newGroupBefore: null }))).toEqual([[1, 2], [4, 5], [6, 7], [8], [3]]);
  });

  it("dropping an item on itself changes nothing", () => {
    const g = board();
    expect(ids(moveItems(g, [4], { group: g[1].key, before: 4 }))).toEqual(ids(g));
  });

  it("reorders groups, keeping the opening first", () => {
    const g = board();
    expect(ids(moveGroup(g, g[3].key, g[1].key))).toEqual([[1, 2], [8], [3, 4, 5], [6, 7]]);
    expect(ids(moveGroup(g, g[1].key, null))).toEqual([[1, 2], [6, 7], [8], [3, 4, 5]]);
    expect(ids(moveGroup(g, OPENING, null))).toEqual(ids(g));
    expect(ids(moveGroup(g, g[2].key, OPENING))).toEqual([[1, 2], [6, 7], [3, 4, 5], [8]]);
  });

  it("round-trips to the saved shape, dropping empty groups", () => {
    expect(fromGroups(moveItems(board(), [8], { group: board()[1].key }))).toEqual({
      round: [1, 2],
      runs: [
        [3, 4, 5],
        [6, 7],
      ],
    });
  });

  it("flags relatives side by side, across group seams too", () => {
    const chains = { 2: 9, 3: 9, 6: 4, 8: 4 };
    expect([...kinNeighbours(board(), chains)].sort()).toEqual([2, 3]);
  });
});

describe("gather", () => {
  it("pulls a theme into one new group where its first member was, in wall order", () => {
    const g = board();
    expect(ids(gather(g, [8, 4, 6], {}))).toEqual([[1, 2], [4, 6, 8], [3, 5], [7]]);
  });

  it("keeps relatives apart when it can", () => {
    const g = board();
    expect(ids(gather(g, [3, 4, 5], { 3: 1, 4: 1 }))).toEqual([[1, 2], [3, 5, 4], [6, 7], [8]]);
  });
});
