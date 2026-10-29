import { describe, expect, it } from "vitest";
import { letterMask, revealableCount, revealedPrefix } from "../lib/hints";
import { byName } from "./fixtures";

const render = (name: string, n: number) =>
  letterMask(name, n)
    .map((c) => (c.hidden ? "_" : c.char))
    .join("");

describe("letter hints", () => {
  it("reveals one letter per step, left to right, keeping earlier letters", () => {
    expect(render("Pikachu", 0)).toBe("_______");
    expect(render("Pikachu", 1)).toBe("P______");
    expect(render("Pikachu", 2)).toBe("Pi_____");
    expect(render("Pikachu", 7)).toBe("Pikachu");
  });

  it("keeps punctuation, spaces and symbols in place", () => {
    expect(render("Mr. Mime", 0)).toBe("__. ____");
    expect(render("Mr. Mime", 3)).toBe("Mr. M___");
    expect(render("Type: Null", 4)).toBe("Type: ____");
    expect(render("Farfetch’d", 8)).toBe("Farfetch’_");
    expect(render("Nidoran♀", 0)).toBe("_______♀");
    expect(render("Ho-Oh", 2)).toBe("Ho-__");
    expect(render("Flabébé", 5)).toBe("Flabé__");
  });

  it("counts letters and digits only", () => {
    expect(revealableCount("Mr. Mime")).toBe(6);
    expect(revealableCount("Porygon2")).toBe(8);
    expect(revealableCount("Nidoran♀")).toBe(7);
  });

  it("never puts hidden letters in the output", () => {
    const hidden = letterMask("Pikachu", 2).filter((c) => c.hidden);
    expect(hidden.every((c) => c.char === "")).toBe(true);
  });

  it("does not over-reveal past the end", () => {
    expect(render("Mew", 10)).toBe("Mew");
  });
});

describe("types", () => {
  it("uses current types for representative species", () => {
    expect(byName("Charizard").types).toEqual(["fire", "flying"]);
    expect(byName("Mewtwo").types).toEqual(["psychic"]);
    expect(byName("Clefairy").types).toEqual(["fairy"]);
    expect(byName("Pecharunt").types).toEqual(["poison", "ghost"]);
  });
});

describe("revealed prefix", () => {
  it("is empty until a letter is revealed", () => {
    expect(revealedPrefix("Pikachu", 0)).toBe("");
  });

  it("grows one letter per reveal and carries following punctuation", () => {
    expect(revealedPrefix("Pikachu", 3)).toBe("Pik");
    expect(revealedPrefix("Mr. Mime", 2)).toBe("Mr. ");
    expect(revealedPrefix("Ho-Oh", 1)).toBe("H");
    expect(revealedPrefix("Ho-Oh", 2)).toBe("Ho-");
  });

  it("is the whole name once every letter is revealed", () => {
    expect(revealedPrefix("Nidoran♀", 7)).toBe("Nidoran♀");
    expect(revealedPrefix("Mew", 9)).toBe("Mew");
  });
});
