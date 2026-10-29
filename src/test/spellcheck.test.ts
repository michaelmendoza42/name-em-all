import { describe, expect, it } from "vitest";
import { gradeGuess } from "../lib/hints";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage } from "./fixtures";

// Made-up names, so the tests don't depend on (or spoil) real ones.
const marks = (name: string, guess: string) =>
  gradeGuess(name, guess)
    .map((c) => ({ hit: "G", near: "Y", miss: ".", plain: "_" })[c.state])
    .join("");

describe("Spellcheck grading", () => {
  it("marks right place green, elsewhere yellow, absent grey", () => {
    expect(marks("Zorbit", "Zorbit")).toBe("GGGGGG");
    expect(marks("Zorbit", "Tibroz")).toBe("YYYYYY");
    expect(marks("Zorbit", "Zaxbqq")).toBe("G..G..");
  });

  it("ignores case and accents", () => {
    expect(marks("Flébé", "fLEBE")).toBe("GGGGG");
  });

  it("lights each unmatched letter of the name at most once", () => {
    // One "a" in the name, already green: the other "a"s are grey.
    expect(marks("Kalm", "Kaaa")).toBe("GG..");
    // One "o" in the name, out of place: only the first "o" typed is yellow.
    expect(marks("Oxy", "yoo")).toBe("YY.");
  });

  it("grades letters past the end like any other, so length never shows", () => {
    expect(marks("Rexo", "Rexxo")).toBe("GGG.Y");
    expect(marks("Rex", "Rexrrr")).toBe("GGG...");
  });

  it("grades a short guess without padding it out", () => {
    expect(marks("Zorbit", "Zo")).toBe("GG");
  });

  it("passes spaces and punctuation through ungraded", () => {
    expect(marks("Mr. Zed", "Mr Zed")).toBe("GG_GGG");
    expect(marks("Ab-Cd", "Ab Cd")).toBe("GG_GG");
  });
});

describe("saved guesses", () => {
  it("keeps Spellcheck and typed drafts across a 'refresh'", () => {
    const storage = new MemoryStorage();
    const a = new ProgressStore(storage);
    a.spellcheck(25);
    a.setDraft(25, "Zorbi");
    a.setDraft(7, "half");
    const b = new ProgressStore(storage);
    expect(b.get(25).spellcheck).toBe(true);
    expect(b.draft(25)).toBe("Zorbi");
    expect(b.draft(7)).toBe("half");
    expect(b.get(7).spellcheck).toBeUndefined();
  });

  it("clears drafts when emptied, forgotten, or reset", () => {
    const storage = new MemoryStorage();
    const s = new ProgressStore(storage);
    s.setDraft(1, "abc");
    s.setDraft(1, "");
    expect(new ProgressStore(storage).draft(1)).toBe("");
    s.setDraft(2, "abc");
    s.forgetMany([2]);
    expect(new ProgressStore(storage).draft(2)).toBe("");
    s.setDraft(3, "abc");
    s.spellcheck(3);
    s.reset();
    const after = new ProgressStore(storage);
    expect(after.draft(3)).toBe("");
    expect(after.get(3).spellcheck).toBeUndefined();
  });

  it("drops malformed drafts", () => {
    const storage = new MemoryStorage();
    storage.setItem("wtp-ultimate:progress:drafts", JSON.stringify({ version: 1, drafts: { "1": 5, x: "a", "2": "ok" } }));
    const s = new ProgressStore(storage);
    expect(s.draft(1)).toBe("");
    expect(s.draft(2)).toBe("ok");
  });
});
