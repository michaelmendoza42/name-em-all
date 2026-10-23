// Which menu-icon set a completed generation's cards show on their fronts
// instead of the official artwork, persisted to localStorage. Stored as
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
