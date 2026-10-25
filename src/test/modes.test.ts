import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HARD_RUN_KEY,
  MODES,
  flatOrder,
  hardOrder,
  hardRunSeed,
  modeFromPath,
  parseLookalikes,
  startHardRun,
} from "../lib/modes";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, dataset } from "./fixtures";

const ids = dataset.species.map((s) => s.id);
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

describe("modeFromPath", () => {
  it("maps each mode's path, and anything else to the Pokédex", () => {
    expect(modeFromPath("/")).toBe("dex");
    expect(modeFromPath("/hard-mode")).toBe("hard");
    expect(modeFromPath("/hard-mode/")).toBe("hard");
    expect(modeFromPath("/random")).toBe("dex");
    expect(modeFromPath("/app/hard-mode", "/app/")).toBe("hard");
  });
});

describe("separate progress per mode", () => {
  it("solving in one mode doesn't solve it in another", () => {
    const storage = new MemoryStorage();
    const [dex, hard] = MODES.map((m) => new ProgressStore(storage, m.progressKey));
    hard.solve(25);
    expect(hard.get(25).solved).toBe(true);
    expect(dex.get(25).solved).toBe(false);
    expect(new ProgressStore(storage, MODES[1].progressKey).get(25).solved).toBe(true);
  });
});

const lookalikes = parseLookalikes(
  JSON.parse(readFileSync(path.resolve(process.cwd(), "public/lookalikes.json"), "utf8")),
);
const kinNeighbours = (order: number[]) =>
  order.slice(1).filter((id, i) => {
    const c = lookalikes.chains[order[i]];
    return c !== undefined && c === lookalikes.chains[id];
  });

describe("hardOrder", () => {
  it("is the round opening then the runs as built, every species once, on a first run", () => {
    const order = hardOrder(lookalikes);
    expect(order).toEqual([...lookalikes.round, ...lookalikes.runs.flat()]);
    expect(sorted(order)).toEqual(ids);
    expect(kinNeighbours(order)).toEqual([]);
  });

  it("rearranges later runs, within lookalike groups too, the same way for the same seed, keeping every rule", () => {
    const canonical = hardOrder(lookalikes);
    for (const seed of [1, 2, 3, 42, 99999]) {
      const order = hardOrder(lookalikes, seed);
      expect(order).not.toEqual(canonical);
      expect(hardOrder(lookalikes, seed)).toEqual(order);
      expect(sorted(order)).toEqual(ids);
      expect(sorted(order.slice(0, lookalikes.round.length))).toEqual(sorted(lookalikes.round));
      expect(kinNeighbours(order)).toEqual([]);
      // Each run of lookalikes stays together (shuffled within itself).
      for (const run of lookalikes.runs) {
        const at = run.map((id) => order.indexOf(id)).sort((a, b) => a - b);
        expect(at.at(-1)! - at[0]).toBe(run.length - 1);
      }
      const reordered = lookalikes.runs.filter((run) => {
        const placed = order.slice(order.indexOf(run[0]) - run.length, order.indexOf(run[0]) + run.length);
        return (
          run.length > 2 && !placed.join().includes(run.join()) && !placed.join().includes([...run].reverse().join())
        );
      });
      expect(reordered.length).toBeGreaterThan(0);
    }
  });
});

describe("hard runs", () => {
  it("the first run has no seed; each later run gets a new one", () => {
    const storage = new MemoryStorage();
    expect(hardRunSeed(storage)).toBeUndefined();
    startHardRun(storage);
    expect(hardRunSeed(storage)).toBeUndefined();
    startHardRun(storage, () => 0.25);
    const second = hardRunSeed(storage);
    expect(second).toBeDefined();
    startHardRun(storage, () => 0.75);
    expect(hardRunSeed(storage)).not.toBe(second);
    expect(JSON.parse(storage.getItem(HARD_RUN_KEY)!).run).toBe(3);
  });
});

describe("flatOrder", () => {
  it("still shows species a stale lookalikes file leaves out, and skips unknown ids", () => {
    const wall = flatOrder(dataset, [3, 99999, 1, 3]).map((s) => s.id);
    expect(wall.slice(0, 2)).toEqual([3, 1]);
    expect(sorted(wall)).toEqual(ids);
  });
});
