import type { Species } from "./dataset";

// Main region introduced with each generation (PokéAPI's generation_id).
// Generation VIII also holds the Hisui species from Legends: Arceus (#899–905).
const REGIONS: Record<number, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const romanGeneration = (generation: number) => ROMAN[generation] ?? String(generation);

export interface GenerationGroup {
  generation: number;
  title: string; // "Generation I"
  region: string | undefined; // "Kanto"; undefined for a generation not in the table yet
  species: readonly Species[];
}

// Splits the dex-ordered species list into runs by generation.
export function groupByGeneration(species: readonly Species[]): GenerationGroup[] {
  const groups: GenerationGroup[] = [];
  for (const s of species) {
    let group = groups.at(-1);
    if (!group || group.generation !== s.generation) {
      group = {
        generation: s.generation,
        title: `Generation ${romanGeneration(s.generation)}`,
        region: REGIONS[s.generation],
        species: [],
      };
      groups.push(group);
    }
    (group.species as Species[]).push(s);
  }
  return groups;
}
