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

export function visibleTypes(types: readonly string[], revealed: number): readonly string[] {
  return types.slice(0, Math.max(0, Math.min(revealed, types.length)));
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

// What's left after the prefix, with hidden letters as underscores.
export function remainingPattern(name: string, revealed: number): string {
  const prefixLength = Array.from(revealedPrefix(name, revealed)).length;
  return letterMask(name, revealed)
    .slice(prefixLength)
    .map((c) => (c.hidden ? "_" : c.char))
    .join("");
}
