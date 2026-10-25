// Turns a curated arrangement into public/lookalikes.json. Shared by the
// model build (build.mjs) and the /curate page's save endpoint (vite.config.ts),
// so a hand-made arrangement and a generated one are checked the same way.
//
//   scripts/lookalikes/curated.json   { "round": [id, ...], "runs": [[id, ...], ...] }
//
// curated.json, once saved from /curate, is the canonical arrangement: the
// build publishes it instead of the model's order. Delete it to go back to
// the model's.
//
// No dependencies beyond Node, so the dev server can load it.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CURATED = path.join(ROOT, "scripts", "lookalikes", "curated.json");
export const OUT = path.join(ROOT, "public", "lookalikes.json");
const POKEDEX = path.join(ROOT, "public", "pokedex.json");

const isIds = (v) => Array.isArray(v) && v.every(Number.isInteger);

export async function readCurated() {
  const text = await readFile(CURATED, "utf8").catch(() => null);
  return text === null ? null : JSON.parse(text);
}

// One group per line, so a curation shows up in git as a readable diff.
export async function writeCurated({ round, runs }) {
  const lines = [
    `  "round": ${JSON.stringify(round)},`,
    `  "runs": [`,
    runs.map((r) => `    ${JSON.stringify(r)}`).join(",\n"),
    `  ]`,
  ];
  await writeFile(CURATED, `{\n${lines.join("\n")}\n}\n`);
}

// Checks an arrangement against the dataset and the evolution rule.
// `chains` maps species id to evolution chain (only species with relatives).
// Returns the cleaned arrangement plus what was wrong: species it left out
// (added at the end as their own group), unknown or repeated ids (dropped),
// and relatives side by side (which stop it being published).
export async function check(arrangement, chains) {
  if (!arrangement || !isIds(arrangement.round) || !Array.isArray(arrangement.runs) || !arrangement.runs.every(isIds))
    throw new Error("arrangement must be { round: [ids], runs: [[ids], ...] }");
  const ids = JSON.parse(await readFile(POKEDEX, "utf8")).species.map((s) => s.id);
  const known = new Set(ids);
  const seen = new Set();
  const unknown = [];
  const keep = (group) =>
    group.filter((id) => {
      if (!known.has(id) || seen.has(id)) {
        unknown.push(id);
        return false;
      }
      seen.add(id);
      return true;
    });
  const round = keep(arrangement.round);
  const runs = arrangement.runs.map(keep).filter((r) => r.length);
  const missing = ids.filter((id) => !seen.has(id));
  if (missing.length) runs.push(missing);
  const order = [...round, ...runs.flat()];
  const kin = order
    .slice(1)
    .flatMap((id, i) => (chains[id] !== undefined && chains[id] === chains[order[i]] ? [[order[i], id]] : []));
  return { round, runs, missing, unknown, kin };
}

// Writes public/lookalikes.json, unless relatives sit side by side.
export async function publish(arrangement, chains, model) {
  const result = await check(arrangement, chains);
  if (result.kin.length) return { ...result, published: false };
  await writeFile(OUT, JSON.stringify({ model, round: result.round, runs: result.runs, chains }) + "\n");
  return { ...result, published: true };
}

// The chain map the last published file carries, so saving from /curate
// works without fetching PokéAPI.
export async function publishedChains() {
  return JSON.parse(await readFile(OUT, "utf8")).chains;
}
