export interface Species {
  id: number; // National Pokédex number; also the stable storage key
  slug: string;
  name: string; // official English name
  generation: number;
  types: readonly string[];
  animated?: boolean; // has public/anim/<id>.gif, distinct from its Gen V sprite
  sprites?: readonly number[]; // generations with public/sprites/<gen>/<id>.*
}

export interface Dataset {
  count: number;
  species: readonly Species[];
}

// Checks the shape of pokedex.json and that it really is a complete,
// gap-free National Dex, so the wall never shows a partial list as complete.
export function parseDataset(raw: unknown): Dataset {
  if (!raw || typeof raw !== "object") throw new Error("dataset is not an object");
  const { count, species } = raw as { count?: unknown; species?: unknown };
  if (typeof count !== "number" || !Array.isArray(species)) throw new Error("dataset is missing count or species");
  if (species.length !== count) throw new Error(`dataset lists ${species.length} of ${count} species`);
  species.forEach((s: Species, i) => {
    const ok =
      s &&
      s.id === i + 1 &&
      typeof s.slug === "string" &&
      typeof s.name === "string" &&
      s.name.length > 0 &&
      Number.isInteger(s.generation) &&
      s.generation >= 1 &&
      Array.isArray(s.types) &&
      s.types.length >= 1 &&
      s.types.length <= 2 &&
      s.types.every((t) => typeof t === "string");
    if (!ok) throw new Error(`dataset entry ${i + 1} is malformed or out of order`);
  });
  return { count, species };
}

export async function loadDataset(url: string): Promise<Dataset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  return parseDataset(await res.json());
}
