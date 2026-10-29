import { normalizeAnswer } from "./answers";

// Letters and digits are revealed one at a time; spaces, punctuation and
// symbols like ♀ are always shown in place.
const REVEALABLE = /[\p{L}\p{N}]/u;

export function isRevealable(char: string): boolean {
  return REVEALABLE.test(char);
}

export function revealableCount(name: string): number {
  return Array.from(name).filter(isRevealable).length;
}

export interface MaskChar {
  char: string;
  hidden: boolean;
}

// The name with only the first `revealed` letters showing, left to right.
// Hidden letters carry an empty char so they never reach the DOM.
export function letterMask(name: string, revealed: number): MaskChar[] {
  let shown = 0;
  return Array.from(name).map((char) => {
    if (!isRevealable(char)) return { char, hidden: false };
    return shown++ < revealed ? { char, hidden: false } : { char: "", hidden: true };
  });
}

// The revealed start of the name, locked in the input: the first `revealed`
// letters plus any punctuation or spaces that follow them, up to the next
// hidden letter. "Mr. Mime" with 2 revealed → "Mr. ".
export function revealedPrefix(name: string, revealed: number): string {
  if (revealed <= 0) return "";
  const chars = Array.from(name);
  let seen = 0;
  for (let i = 0; i < chars.length; i++) {
    if (isRevealable(chars[i]) && seen++ === revealed) return chars.slice(0, i).join("");
  }
  return name;
}

// Spellcheck hint: Wordle-style grading of a guess, letter by letter, one
// entry per character of the guess. Only letters and digits are compared
// (normalized like answers, so "é" matches "e"); spaces and punctuation pass
// through as "plain". "hit" is the right letter in the right place, "near" is
// a letter the name has elsewhere (each unmatched letter in the name lights
// up at most one), "miss" is neither. Letters past the end of the name are
// graded the same way and nothing marks them, so a check never gives away
// the name's length.
export type GradeState = "hit" | "near" | "miss" | "plain";

export interface GradedChar {
  char: string;
  state: GradeState;
}

const letterKey = (char: string) => normalizeAnswer(char).slice(0, 1);

export function gradeGuess(name: string, guess: string): GradedChar[] {
  const answer = Array.from(name).filter(isRevealable).map(letterKey);
  const out: GradedChar[] = Array.from(guess).map((char) => ({ char, state: "plain" as GradeState }));
  const letters = out.filter((c) => isRevealable(c.char) && letterKey(c.char));

  // Greens first, so they never lend a letter to a yellow.
  const pool = new Map<string, number>();
  answer.forEach((a, i) => {
    if (letterKey(letters[i]?.char ?? "") === a) letters[i].state = "hit";
    else pool.set(a, (pool.get(a) ?? 0) + 1);
  });
  for (const c of letters) {
    if (c.state === "hit") continue;
    const key = letterKey(c.char);
    const left = pool.get(key) ?? 0;
    c.state = left > 0 ? "near" : "miss";
    if (left > 0) pool.set(key, left - 1);
  }
  return out;
}
