// Types for publish.mjs, which vite.config.ts imports for the /curate page.
export interface Arrangement {
  round: number[];
  runs: number[][];
}
export interface Checked extends Arrangement {
  missing: number[];
  unknown: number[];
  kin: [number, number][];
}
export const CURATED: string;
export const OUT: string;
export function readCurated(): Promise<Arrangement | null>;
export function writeCurated(arrangement: Arrangement): Promise<void>;
export function check(arrangement: unknown, chains: Record<string, number>): Promise<Checked>;
export function publish(
  arrangement: unknown,
  chains: Record<string, number>,
  model: string,
): Promise<Checked & { published: boolean }>;
export function publishedChains(): Promise<Record<string, number>>;
