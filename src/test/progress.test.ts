import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY, ProgressStore, STORAGE_KEY, sanitizeProgress } from "../lib/progress";
import { MemoryStorage } from "./fixtures";

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});
const saved = () => JSON.parse(storage.getItem(STORAGE_KEY)!);

describe("ProgressStore", () => {
  it("starts empty", () => {
    expect(new ProgressStore(storage).get(25)).toEqual(EMPTY);
  });

  it("saves immediately and restores after a 'refresh'", () => {
    const a = new ProgressStore(storage);
    a.solve(25);
    expect(saved().pokemon["25"].solved).toBe(true);
    a.revealArtwork(1);
    a.revealLetter(1, 9);
    a.revealLetter(1, 9);

    const b = new ProgressStore(storage);
    expect(b.get(25)).toEqual({ solved: true, artwork: false, letters: 0 });
    expect(b.get(1)).toEqual({ solved: false, artwork: true, letters: 2 });
  });

  it("keeps hints independent per Pokémon", () => {
    const s = new ProgressStore(storage);
    s.revealLetter(4, 10);
    s.revealArtwork(7);
    expect(s.get(4).artwork).toBe(false);
    expect(s.get(7).letters).toBe(0);
    expect(s.get(1)).toEqual(EMPTY);
  });

  it("caps letter hints at the name length", () => {
    const s = new ProgressStore(storage);
    for (let i = 0; i < 5; i++) s.revealLetter(151, 3);
    expect(s.get(151).letters).toBe(3);
  });

  it("does not mark solved when artwork or every letter is revealed", () => {
    const s = new ProgressStore(storage);
    s.revealArtwork(151);
    for (let i = 0; i < 3; i++) s.revealLetter(151, 3);
    expect(s.get(151).solved).toBe(false);
  });

  it("counts solved Pokémon among known ids only", () => {
    const s = new ProgressStore(storage);
    s.solve(1);
    s.solve(4);
    s.revealArtwork(7);
    s.solve(9999);
    expect(s.solvedCount([1, 4, 7])).toBe(2);
  });

  it("notifies only the affected tile plus global listeners", () => {
    const s = new ProgressStore(storage);
    let tile1 = 0, tile2 = 0, all = 0;
    s.subscribe(1, () => tile1++);
    s.subscribe(2, () => tile2++);
    s.subscribeAll(() => all++);
    s.revealLetter(1, 5);
    expect([tile1, tile2, all]).toEqual([1, 0, 1]);
  });

  it("reset clears memory and storage", () => {
    const s = new ProgressStore(storage);
    s.solve(1);
    s.revealLetter(2, 5);
    s.reset();
    expect(s.get(1)).toEqual(EMPTY);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(new ProgressStore(storage).get(2)).toEqual(EMPTY);
  });

  it("survives malformed JSON without crashing and backs it up", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    const s = new ProgressStore(storage);
    expect(s.get(1)).toEqual(EMPTY);
    expect(storage.getItem(`${STORAGE_KEY}:unreadable-backup`)).toBe("{not json");
  });

  it("ignores an unknown schema version", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, pokemon: { "1": { solved: true } } }));
    expect(new ProgressStore(storage).get(1)).toEqual(EMPTY);
  });

  it("works in memory when storage is unavailable or full", () => {
    const none = new ProgressStore(null);
    none.solve(1);
    expect(none.get(1).solved).toBe(true);
    expect(none.persistent).toBe(false);

    storage.failWrites = true;
    const full = new ProgressStore(storage);
    full.solve(1);
    expect(full.get(1).solved).toBe(true);
    expect(full.persistent).toBe(false);
  });
});

describe("sanitizeProgress", () => {
  it("drops bad keys and coerces bad values", () => {
    expect(
      sanitizeProgress({
        version: 1,
        pokemon: {
          "1": { solved: true, artwork: "yes", types: 7, letters: -3 },
          "2": { artwork: true, letters: "4" },
          "0": { solved: true },
          abc: { solved: true },
          "3": null,
          "4": { solved: false },
        },
      }),
    ).toEqual({
      "1": { solved: true, artwork: false, letters: 0 },
      "2": { solved: false, artwork: true, letters: 0 },
    });
  });

  it("returns empty for non-objects", () => {
    expect(sanitizeProgress(null)).toEqual({});
    expect(sanitizeProgress("x")).toEqual({});
    expect(sanitizeProgress({ version: 1, pokemon: [] })).toEqual({});
  });
});
