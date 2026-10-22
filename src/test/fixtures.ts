import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDataset } from "../lib/dataset";

export const dataset = parseDataset(
  JSON.parse(readFileSync(path.resolve(process.cwd(), "public/pokedex.json"), "utf8")),
);
export const byName = (name: string) => {
  const s = dataset.species.find((x) => x.name === name);
  if (!s) throw new Error(`no species ${name}`);
  return s;
};

// Minimal in-memory Storage for persistence tests.
export class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(k, String(v));
  }
}
