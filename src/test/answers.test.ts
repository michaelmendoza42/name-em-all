import { describe, expect, it } from "vitest";
import { buildAnswerIndex, normalizeAnswer } from "../lib/answers";
import { dataset, byName } from "./fixtures";

const index = buildAnswerIndex(dataset.species);
const ok = (name: string, guess: string) => index.isCorrect(byName(name).id, guess);

describe("normalizeAnswer", () => {
  it("trims, lowercases and strips punctuation, spaces and accents", () => {
    expect(normalizeAnswer("  Mr. Mime ")).toBe("mrmime");
    expect(normalizeAnswer("Flabébé")).toBe("flabebe");
    expect(normalizeAnswer("Farfetch’d")).toBe("farfetchd");
    expect(normalizeAnswer("Type: Null")).toBe("typenull");
    expect(normalizeAnswer("Nidoran♀")).toBe("nidoranf");
    expect(normalizeAnswer("Nidoran♂")).toBe("nidoranm");
    expect(normalizeAnswer("PIKACHU")).toBe("pikachu");
  });
});

describe("answer index", () => {
  it("accepts every canonical name for its own species", () => {
    for (const s of dataset.species) expect(index.isCorrect(s.id, s.name), s.name).toBe(true);
  });

  it("accepts harmless formatting differences", () => {
    expect(ok("Pikachu", "  pikachu  ")).toBe(true);
    expect(ok("Mr. Mime", "mr mime")).toBe(true);
    expect(ok("Mr. Mime", "MrMime")).toBe(true);
    expect(ok("Farfetch’d", "farfetch'd")).toBe(true);
    expect(ok("Flabébé", "flabebe")).toBe(true);
    expect(ok("Ho-Oh", "ho oh")).toBe(true);
    expect(ok("Porygon-Z", "porygon z")).toBe(true);
    expect(ok("Porygon2", "Porygon 2")).toBe(true);
    expect(ok("Type: Null", "type null")).toBe(true);
    expect(ok("Mime Jr.", "mime jr")).toBe(true);
    expect(ok("Tapu Koko", "tapukoko")).toBe(true);
    expect(ok("Jangmo-o", "jangmoo")).toBe(true);
  });

  it("accepts dictionary aliases", () => {
    expect(ok("Nidoran♀", "Nidoran Female")).toBe(true);
    expect(ok("Nidoran♀", "nidoran-f")).toBe(true);
    expect(ok("Nidoran♂", "nidoran male")).toBe(true);
    expect(ok("Farfetch’d", "Farfetched")).toBe(true);
    expect(ok("Sirfetch’d", "sirfetched")).toBe(true);
    expect(ok("Mr. Mime", "Mister Mime")).toBe(true);
    expect(ok("Mime Jr.", "Mime Junior")).toBe(true);
  });

  it("rejects ambiguous answers", () => {
    expect(ok("Nidoran♀", "Nidoran")).toBe(false);
    expect(ok("Nidoran♂", "Nidoran")).toBe(false);
  });

  it("rejects another species' name and near misses (no fuzzy matching)", () => {
    expect(ok("Pikachu", "Raichu")).toBe(false);
    expect(ok("Pikachu", "pikach")).toBe(false);
    expect(ok("Pikachu", "pikachuu")).toBe(false);
    expect(ok("Nidoran♀", "Nidoran Male")).toBe(false);
    expect(ok("Porygon2", "Porygon")).toBe(false);
    expect(ok("Mr. Mime", "Mr. Rime")).toBe(false);
    expect(ok("Pikachu", "")).toBe(false);
    expect(ok("Pikachu", " .-! ")).toBe(false);
  });

  it("knows when a longer accepted answer extends the guess", () => {
    const f = byName("Nidoran♀").id;
    expect(index.isExtendable(f, "nidoran f")).toBe(true);
    expect(index.isExtendable(f, "Nidoran Female")).toBe(false);
    expect(index.isExtendable(byName("Pikachu").id, "pikachu")).toBe(false);
  });

  it("drops an alias that collides with another species", () => {
    const species = [
      { id: 1, slug: "a", name: "Alpha" },
      { id: 2, slug: "b", name: "Beta" },
    ];
    const idx = buildAnswerIndex(species, { a: ["Shared"], b: ["Shared", "Bee"] });
    expect(idx.isCorrect(1, "shared")).toBe(false);
    expect(idx.isCorrect(2, "shared")).toBe(false);
    expect(idx.isCorrect(2, "bee")).toBe(true);
  });
});
