// Which menu-icon set a completed generation's cards show on their fronts
// instead of the official artwork, persisted to localStorage, and which sets
// are unlocked. Stored as
// { "<section generation>": <icon generation> }; a missing entry means artwork.

import { browserStorage } from "./progress";

export const ICON_STYLE_KEY = "wtp-ultimate:icon-style";

function read(storage: Storage | null): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(ICON_STYLE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => Number.isInteger(v))) as Record<string, number>;
  } catch {
    return {};
  }
}

export function getIconStyle(generation: number, storage = browserStorage()): number | undefined {
  return read(storage)[generation];
}

// Best effort: a failed write only means the choice won't survive a reload.
export function setIconStyle(generation: number, iconGeneration: number | undefined, storage = browserStorage()): void {
  const styles = read(storage);
  if (iconGeneration === undefined) delete styles[generation];
  else styles[generation] = iconGeneration;
  try {
    storage?.setItem(ICON_STYLE_KEY, JSON.stringify(styles));
  } catch {
    // ignore
  }
}

// Each icon style unlocks by completing its own generation: finishing Gen III
// unlocks Gen III icons (for every species that game has, Gens I–II included).
// Gens I–II's shared party icons are the bonus for completing every generation.
export function unlockedIconStyles(completed: readonly number[], all: readonly number[]): number[] {
  const done = new Set(completed);
  const styles = completed.filter((g) => g >= 3);
  if (all.length > 0 && all.every((g) => done.has(g))) styles.push(1, 2);
  return styles.sort((a, b) => a - b);
}
