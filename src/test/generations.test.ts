import { describe, expect, it } from "vitest";
import { groupByGeneration } from "../lib/generations";
import { dataset } from "./fixtures";

describe("groupByGeneration", () => {
  const groups = groupByGeneration(dataset.species);

  it("splits the dex into nine generations with their regions, in order", () => {
    expect(groups.map((g) => `${g.title} ${g.region}`)).toEqual([
      "Generation I Kanto",
      "Generation II Johto",
      "Generation III Hoenn",
      "Generation IV Sinnoh",
      "Generation V Unova",
      "Generation VI Kalos",
      "Generation VII Alola",
      "Generation VIII Galar",
      "Generation IX Paldea",
    ]);
  });

  it("has the known species counts and loses no one", () => {
    expect(groups.map((g) => g.species.length)).toEqual([151, 100, 135, 107, 156, 72, 88, 96, 120]);
    expect(groups.flatMap((g) => g.species.map((s) => s.id))).toEqual(dataset.species.map((s) => s.id));
  });

  it("starts each generation at the right dex number", () => {
    expect(groups.map((g) => g.species[0].id)).toEqual([1, 152, 252, 387, 494, 650, 722, 810, 906]);
  });
});
