// The app is in one mode at a time, saved under MODE_KEY, and each mode has
// its own path and its own progress save.
//
//   dex    /            National Dex order, sectioned by generation
//   hard   /hard-mode   one flat wall where each silhouette sits next to its
//                       closest lookalikes (public/lookalikes.json); no dex
//                       numbers until solved, and no hints. A generation named
//                       in full leaves the wall for its own Pokédex section.
//
// Switching is deliberate and one-sided so the Pokédex can't be used to look
// up Hard Mode answers: Hard Mode starts from zero (Pokédex solves don't count
// and stay put for later), and leaving it erases its progress.

import type { Dataset, Species } from "./dataset";
import { STORAGE_KEY } from "./progress";

export type Mode = "dex" | "hard";

export interface ModeInfo {
  mode: Mode;
  path: string; // relative to the app's base URL
  label: string; // shown in the menu and confirmations
  progressKey: string;
}

export const MODES: readonly ModeInfo[] = [
  {
    mode: "dex",
    path: "",
    label: "Pokédex",
    progressKey: STORAGE_KEY,
  },
  {
    mode: "hard",
    path: "hard-mode",
    label: "Hard Mode",
    progressKey: `${STORAGE_KEY}:hard`,
  },
];

export const modeInfo = (mode: Mode) => MODES.find((m) => m.mode === mode)!;

export const MODE_KEY = "wtp-ultimate:mode";

export function savedMode(storage: Storage | null): Mode {
  try {
    return storage?.getItem(MODE_KEY) === "hard" ? "hard" : "dex";
  } catch {
    return "dex";
  }
}

// Best effort: a failed write only means the mode won't survive a reload.
export function saveMode(mode: Mode, storage: Storage | null) {
  try {
    if (mode === "dex") storage?.removeItem(MODE_KEY);
    else storage?.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

// The mode a URL path names; anything unknown is the Pokédex.
export function modeFromPath(pathname: string, base = "/"): Mode {
  const rest = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/^\/+|\/+$/g, "");
  return MODES.find((m) => m.path && m.path === rest)?.mode ?? "dex";
}

// Hard Mode's order, built by scripts/lookalikes: the round opening, then
// runs of close lookalikes, plus which species share an evolution chain.
export interface Lookalikes {
  round: readonly number[];
  runs: readonly (readonly number[])[];
  chains: Readonly<Record<string, number>>;
}

const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.every(Number.isInteger);

export function parseLookalikes(raw: unknown): Lookalikes {
  const { round, runs, chains } = (raw ?? {}) as Record<string, unknown>;
  if (!isIds(round) || !Array.isArray(runs) || !runs.every(isIds) || !chains || typeof chains !== "object")
    throw new Error("lookalikes are malformed");
  return { round, runs, chains: chains as Record<string, number> };
}

// Which Hard Mode run this is and how to arrange it, saved when a run starts.
export const HARD_RUN_KEY = "wtp-ultimate:hard-run";

interface HardRun {
  run: number; // 1 for someone's first Hard Mode run
  seed?: number; // set from the second run on: that run's arrangement
}

function readRun(storage: Storage | null): HardRun | undefined {
  try {
    const parsed = JSON.parse(storage?.getItem(HARD_RUN_KEY) ?? "null") as HardRun | null;
    return parsed && Number.isInteger(parsed.run) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Called on entering Hard Mode. The first run gets the canonical wall, the
// same for everyone; every run after that gets its own arrangement.
export function startHardRun(storage: Storage | null, random = Math.random) {
  const run = (readRun(storage)?.run ?? 0) + 1;
  const next: HardRun = run > 1 ? { run, seed: Math.floor(random() * 2 ** 31) } : { run };
  try {
    storage?.setItem(HARD_RUN_KEY, JSON.stringify(next));
  } catch {
    // the run just gets the canonical wall after a reload
  }
}

export const hardRunSeed = (storage: Storage | null) => readRun(storage)?.seed;

// Small seeded PRNG (mulberry32): the same seed always arranges the same wall.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Hard Mode's wall order. Without a seed, the canonical one: the opening,
// then the runs as built. With one, the opening is shuffled, the runs are
// shuffled, and each run is shuffled within itself, so lookalikes stay side
// by side but the wall is new. Either way, two Pokémon from one evolution
// chain are never consecutive.
export function hardOrder({ round, runs, chains }: Lookalikes, seed?: number): number[] {
  const canonical = [...round, ...runs.flat()];
  if (seed === undefined) return canonical;
  const random = seeded(seed);
  const kin = (a: number | undefined, b: number) =>
    a !== undefined && chains[a] !== undefined && chains[a] === chains[b];
  // Lays pieces down in order, skipping ahead to the next one (or flipping
  // it) when it would start next to a relative of the card before.
  const lay = (out: number[], pieces: (readonly number[])[]) => {
    const left = [...pieces];
    while (left.length) {
      let placed = false;
      for (let k = 0; k < left.length && !placed; k++) {
        for (const piece of [left[k], [...left[k]].reverse()]) {
          if (kin(out.at(-1), piece[0])) continue;
          out.push(...piece);
          left.splice(k, 1);
          placed = true;
          break;
        }
      }
      if (!placed) return false;
    }
    return true;
  };
  // A run's own shuffle, kept only if it has no relatives side by side
  // (else the run as built, maybe flipped).
  const mix = (run: readonly number[]) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const mixed = shuffle(run, random);
      if (!mixed.some((id, i) => kin(mixed[i - 1], id))) return mixed;
    }
    return random() < 0.5 ? [...run].reverse() : run;
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    const out: number[] = [];
    if (
      lay(
        out,
        shuffle(round, random).map((id) => [id]),
      ) &&
      lay(out, shuffle(runs, random).map(mix))
    )
      return out;
  }
  return canonical;
}

// The cards of a flat (unsectioned) wall, in order. Every species appears
// exactly once: ids the dataset doesn't know are skipped, and any a stale
// lookalikes file leaves out go at the end.
export function flatOrder(data: Dataset, ids: readonly number[]): Species[] {
  const byId = new Map(data.species.map((s) => [s.id, s]));
  const seen = new Set<number>();
  const out: Species[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s && !seen.has(id)) {
      seen.add(id);
      out.push(s);
    }
  }
  return [...out, ...data.species.filter((s) => !seen.has(s.id))];
}
