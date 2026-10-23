// Which generation sections are collapsed, persisted to localStorage so the
// layout survives a reload. Stored as a sorted array of generation numbers.

import { browserStorage } from "./progress";

export const COLLAPSED_KEY = "wtp-ultimate:collapsed";

function read(storage: Storage | null): Set<number> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function isCollapsed(generation: number, storage = browserStorage()): boolean {
  return read(storage).has(generation);
}

// Best effort: a failed write only means the state won't survive a reload.
export function setCollapsed(generation: number, collapsed: boolean, storage = browserStorage()): void {
  const set = read(storage);
  if (collapsed) set.add(generation);
  else set.delete(generation);
  try {
    storage?.setItem(COLLAPSED_KEY, JSON.stringify([...set].sort((a, b) => a - b)));
  } catch {
    // ignore
  }
}
