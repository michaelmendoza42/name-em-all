// Per-Pokémon progress, persisted to localStorage under stable National Dex
// numbers (never grid positions).
//
// Stored shape (version 1):
//   { "version": 1, "pokemon": { "25": { "solved": true, "artwork": false, "types": 1, "letters": 3 } } }

export const STORAGE_KEY = "wtp-ultimate:progress";
export const SCHEMA_VERSION = 1;
const MAX_TYPES = 2;
const MAX_LETTERS = 64;

export interface PokemonProgress {
  solved: boolean;
  artwork: boolean; // artwork revealed by hint
  types: number; // type hints used (0–2)
  letters: number; // letters revealed
}

export type ProgressMap = Record<string, PokemonProgress>;

export const EMPTY: PokemonProgress = Object.freeze({ solved: false, artwork: false, types: 0, letters: 0 });

function clampInt(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
}

// Accepts anything and returns only well-formed entries. Unknown fields,
// non-numeric keys and wrong types are dropped instead of throwing.
export function sanitizeProgress(raw: unknown): ProgressMap {
  if (!raw || typeof raw !== "object") return {};
  const { version, pokemon } = raw as { version?: unknown; pokemon?: unknown };
  if (version !== SCHEMA_VERSION || !pokemon || typeof pokemon !== "object") return {};
  const out: ProgressMap = {};
  for (const [key, value] of Object.entries(pokemon)) {
    if (!/^[1-9]\d{0,4}$/.test(key) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const entry: PokemonProgress = {
      solved: v.solved === true,
      artwork: v.artwork === true,
      types: clampInt(v.types, MAX_TYPES),
      letters: clampInt(v.letters, MAX_LETTERS),
    };
    if (entry.solved || entry.artwork || entry.types || entry.letters) out[key] = entry;
  }
  return out;
}

type Listener = () => void;

export class ProgressStore {
  private map: ProgressMap = {};
  private byId = new Map<number, Set<Listener>>();
  private all = new Set<Listener>();
  // false when localStorage is unavailable or writes fail (private mode, quota)
  persistent = true;
  // bumped on reset so the wall can clear unsaved typed guesses
  epoch = 0;

  constructor(private storage: Storage | null) {
    this.map = this.read();
  }

  private read(): ProgressMap {
    if (!this.storage) {
      this.persistent = false;
      return {};
    }
    let text: string | null;
    try {
      text = this.storage.getItem(STORAGE_KEY);
    } catch {
      this.persistent = false;
      return {};
    }
    if (text === null) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if ((parsed as { version?: unknown } | undefined)?.version !== SCHEMA_VERSION) {
      // Unreadable or unknown-version save: keep a copy rather than silently
      // overwriting it on the next change.
      try {
        this.storage.setItem(`${STORAGE_KEY}:unreadable-backup`, text);
      } catch {
        /* nothing more we can do */
      }
      return {};
    }
    return sanitizeProgress(parsed);
  }

  private write() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, pokemon: this.map }));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
  }

  get(id: number): PokemonProgress {
    return this.map[id] ?? EMPTY;
  }

  solvedCount(ids: readonly number[]): number {
    return ids.reduce((n, id) => n + (this.map[id]?.solved ? 1 : 0), 0);
  }

  private set(id: number, next: PokemonProgress) {
    this.map = { ...this.map, [id]: next };
    this.write();
    this.byId.get(id)?.forEach((l) => l());
    this.all.forEach((l) => l());
  }

  solve(id: number) {
    const cur = this.get(id);
    if (!cur.solved) this.set(id, { ...cur, solved: true });
  }

  revealArtwork(id: number) {
    const cur = this.get(id);
    if (!cur.artwork) this.set(id, { ...cur, artwork: true });
  }

  revealType(id: number, available: number) {
    const cur = this.get(id);
    if (cur.types < Math.min(available, MAX_TYPES)) this.set(id, { ...cur, types: cur.types + 1 });
  }

  revealLetter(id: number, available: number) {
    const cur = this.get(id);
    if (cur.letters < Math.min(available, MAX_LETTERS)) this.set(id, { ...cur, letters: cur.letters + 1 });
  }

  reset() {
    this.map = {};
    this.epoch++;
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
        this.persistent = true;
      } catch {
        this.persistent = false;
      }
    }
    this.notifyAll();
  }

  // Pick up changes saved by another tab.
  reload() {
    this.map = this.read();
    this.notifyAll();
  }

  private notifyAll() {
    this.byId.forEach((set) => set.forEach((l) => l()));
    this.all.forEach((l) => l());
  }

  subscribe(id: number, listener: Listener): () => void {
    let set = this.byId.get(id);
    if (!set) this.byId.set(id, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  subscribeAll(listener: Listener): () => void {
    this.all.add(listener);
    return () => this.all.delete(listener);
  }
}

export function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
