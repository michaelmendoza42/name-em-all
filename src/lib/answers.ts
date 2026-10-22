import { ALIASES } from "./aliases";
import type { Species } from "./dataset";

// Reduce a guess to a comparison key: lowercase ASCII letters and digits only.
// "  Mr. Mime " → "mrmime", "Flabébé" → "flabebe", "Nidoran♀" → "nidoranf".
export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

export interface AnswerIndex {
  isCorrect(speciesId: number, guess: string): boolean;
  // True when a longer accepted answer for this species starts with the guess,
  // e.g. "Nidoran F" on the way to "Nidoran Female".
  isExtendable(speciesId: number, guess: string): boolean;
}

// Every accepted key maps to the species it names. A key claimed by more than
// one species is ambiguous and accepted for none of them.
export function buildAnswerIndex(
  species: readonly Pick<Species, "id" | "slug" | "name">[],
  aliases: Readonly<Record<string, readonly string[]>> = ALIASES,
): AnswerIndex {
  const owners = new Map<string, Set<number>>();
  const keysById = new Map<number, string[]>();
  for (const s of species) {
    for (const raw of [s.name, s.slug, ...(aliases[s.slug] ?? [])]) {
      const key = normalizeAnswer(raw);
      if (!key) continue;
      let ids = owners.get(key);
      if (!ids) owners.set(key, (ids = new Set()));
      ids.add(s.id);
      keysById.set(s.id, [...(keysById.get(s.id) ?? []), key]);
    }
  }
  return {
    isCorrect(speciesId, guess) {
      const ids = owners.get(normalizeAnswer(guess));
      return ids !== undefined && ids.size === 1 && ids.has(speciesId);
    },
    isExtendable(speciesId, guess) {
      const key = normalizeAnswer(guess);
      return (keysById.get(speciesId) ?? []).some(
        (k) => k.length > key.length && k.startsWith(key) && owners.get(k)!.size === 1,
      );
    },
  };
}
