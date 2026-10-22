import { describe, expect, it } from "vitest";
import { parseDataset } from "../lib/dataset";
import { ALIASES } from "../lib/aliases";
import { dataset, byName } from "./fixtures";

describe("dataset coverage", () => {
  it("is the complete National Dex, in order, with no gaps", () => {
    expect(dataset.count).toBe(1025);
    expect(dataset.species).toHaveLength(1025);
    dataset.species.forEach((s, i) => expect(s.id).toBe(i + 1));
    expect(dataset.species[0].name).toBe("Bulbasaur");
    expect(dataset.species.at(-1)!.name).toBe("Pecharunt");
  });

  it("covers every generation 1–9", () => {
    expect(new Set(dataset.species.map((s) => s.generation))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("has unique names and one or two types per species", () => {
    expect(new Set(dataset.species.map((s) => s.name)).size).toBe(1025);
    for (const s of dataset.species) expect(s.types.length === 1 || s.types.length === 2).toBe(true);
  });

  it("uses official English names with punctuation and symbols", () => {
    for (const n of ["Nidoran♀", "Nidoran♂", "Farfetch’d", "Mr. Mime", "Type: Null", "Flabébé", "Ho-Oh", "Porygon2"])
      expect(() => byName(n)).not.toThrow();
  });

  it("lists species, not forms or megas", () => {
    expect(dataset.species.some((s) => /-(mega|alola|galar|hisui|paldea|gmax)/.test(s.slug))).toBe(false);
  });

  it("keys every alias to a real species slug", () => {
    const slugs = new Set(dataset.species.map((s) => s.slug));
    for (const slug of Object.keys(ALIASES)) expect(slugs, slug).toContain(slug);
  });

  it("rejects incomplete or malformed data instead of showing a partial wall", () => {
    const good = { count: 2, species: [dataset.species[0], dataset.species[1]] };
    expect(() => parseDataset(good)).not.toThrow();
    expect(() => parseDataset({ ...good, count: 3 })).toThrow(/2 of 3/);
    expect(() => parseDataset({ count: 2, species: [dataset.species[1], dataset.species[0]] })).toThrow();
    expect(() => parseDataset({ count: 1, species: [{ ...dataset.species[0], types: [] }] })).toThrow();
    expect(() => parseDataset(null)).toThrow();
  });
});
