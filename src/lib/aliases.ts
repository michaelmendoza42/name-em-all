// Alternative names accepted for a species, keyed by PokéAPI species slug.
//
// Formatting differences (case, spaces, punctuation, accents, ♀/♂) are already
// handled by normalizeAnswer, so "mr mime", "Flabebe" and "farfetch'd" need no
// entry here. List only genuinely different spellings people commonly use.
// Any alias that normalizes to the same key as another species' name or alias
// is treated as ambiguous and rejected for both (see answers.ts).
export const ALIASES: Readonly<Record<string, readonly string[]>> = {
  "nidoran-f": ["Nidoran Female", "Female Nidoran", "Nidoran Girl"],
  "nidoran-m": ["Nidoran Male", "Male Nidoran", "Nidoran Boy"],
  farfetchd: ["Farfetched"],
  sirfetchd: ["Sirfetched"],
  "mr-mime": ["Mister Mime"],
  "mime-jr": ["Mime Junior", "Mister Mime Jr"],
  "mr-rime": ["Mister Rime"],
  porygon2: ["Porygon Two"],
};
