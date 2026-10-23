// Pokédex entries (the games' flavor text) for one species, from
// public/dex/<id>.json. Built by scripts/build-data.mjs.

export interface DexEntry {
  generation: number; // generation of the games the text appeared in
  versions: readonly string[]; // games that share this exact text, e.g. ["Red", "Blue"]
  text: string;
}

export interface DexGeneration {
  generation: number;
  entries: readonly DexEntry[];
}

export function parseDexEntries(raw: unknown): DexEntry[] {
  if (!Array.isArray(raw)) throw new Error("Pokédex entries are not a list");
  raw.forEach((e: DexEntry, i) => {
    const ok =
      e &&
      Number.isInteger(e.generation) &&
      Array.isArray(e.versions) &&
      e.versions.length > 0 &&
      e.versions.every((v) => typeof v === "string") &&
      typeof e.text === "string" &&
      e.text.length > 0;
    if (!ok) throw new Error(`Pokédex entry ${i + 1} is malformed`);
  });
  return raw;
}

// Entries in runs by generation, oldest first.
export function groupDexEntries(entries: readonly DexEntry[]): DexGeneration[] {
  const groups: { generation: number; entries: DexEntry[] }[] = [];
  for (const e of [...entries].sort((a, b) => a.generation - b.generation)) {
    const group = groups.at(-1);
    if (group?.generation === e.generation) group.entries.push(e);
    else groups.push({ generation: e.generation, entries: [e] });
  }
  return groups;
}

// One request per species per page load, shared by every caller. A failed
// load is forgotten so the next flip tries again.
const cache = new Map<string, Promise<DexEntry[]>>();

export function loadDexEntries(url: string): Promise<DexEntry[]> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        return res.json();
      })
      .then(parseDexEntries);
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}
