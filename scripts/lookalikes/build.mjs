#!/usr/bin/env node
// Orders every silhouette so each sits next to its closest lookalikes, for
// the Hard Mode wall.
//
//   public/lookalikes.json   { "round": [id, ...], "runs": [[id, ...], ...],
//                              "chains": { "<id>": <chain>, ... } }
//
// Each silhouette (public/sil/<id>.webp) is cropped to its outline, centred
// on white and described by a pretrained vision model (DINOv2), whose image
// embeddings capture pose and outline far better than comparing pixels. The
// embeddings of the silhouette and its mirror image are summed, so a Pokémon
// facing either way looks the same, and centred on the average so the
// features every silhouette shares don't dominate.
//
// The order opens with every near-circular silhouette (roundest first), so the
// wall is impossible from the first row, then continues as a short path
// through the rest: nearest-neighbour, tightened with 2-opt. One rule always
// holds: two Pokémon from the same evolution chain are never consecutive
// (grid rows may still stack them vertically). The build fails if it can't.
//
// The path after the opening is cut at its biggest jumps into runs of close
// lookalikes. The round opening followed by the runs in order is the
// canonical wall everyone gets first; a later Hard Mode run reshuffles the
// runs (and the opening) in the browser, using "chains" (species that share
// an evolution chain) to keep the rule at the new seams.
//
// Once an arrangement has been saved from the /curate page
// (scripts/lookalikes/curated.json), that is canonical: this script publishes
// it as is (checked against the dataset and the evolution rule) and skips the
// model. Delete curated.json to rebuild from the model.
//
// Run from the repo root after `npm run data` changes silhouettes:
//   npm --prefix scripts/lookalikes install   # once; ~1.5 GB of model runtime
//   npm run lookalikes
// Embeddings are cached in scripts/.cache/lookalikes, keyed by each
// silhouette's content, so re-runs only embed what changed.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, RawImage } from "@huggingface/transformers";
import sharp from "sharp";
import { publish, readCurated } from "./publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIL = path.join(ROOT, "public", "sil");
const OUT = path.join(ROOT, "public", "lookalikes.json");
const MODEL = "Xenova/dinov2-base";
const CACHE = path.join(ROOT, "scripts", ".cache", "lookalikes", `${MODEL.replace("/", "_")}.json`);
const CHAINS = path.join(ROOT, "scripts", ".cache", "lookalikes", "chains.json");
const GRAPHQL = "https://graphql.pokeapi.co/v1beta2";
const SIDE = 224; // the model's input size
const PAD = 12;
// Overlap with a same-area disc at the centroid (intersection over union)
// that counts as "round": Electrode is 0.99, Jigglypuff 0.84.
const ROUND_MIN = 0.84;
// Share of the path's steps, the largest, where it's cut into runs.
const CUT_SHARE = 0.12;
// Longer runs are split at their own largest step, so every run can move.
const MAX_RUN = 30;
// Stands in for "never" between same-chain Pokémon: far beyond any real
// distance (at most 2), but finite so sums stay comparable.
const FORBIDDEN = 1e6;

// Evolution chain id per species, from PokéAPI (cached; delete to refresh).
async function chains() {
  const cached = await readFile(CHAINS, "utf8").catch(() => null);
  if (cached) return JSON.parse(cached);
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ pokemonspecies(order_by: { id: asc }) { id evolution_chain_id } }" }),
  });
  if (!res.ok) throw new Error(`PokéAPI GraphQL returned ${res.status}`);
  const rows = (await res.json()).data.pokemonspecies;
  const out = Object.fromEntries(rows.map((r) => [r.id, r.evolution_chain_id ?? `solo-${r.id}`]));
  await mkdir(path.dirname(CHAINS), { recursive: true });
  await writeFile(CHAINS, JSON.stringify(out));
  return out;
}

// How close the silhouette is to a disc: intersection over union with the
// disc of the same area centred on its centroid.
async function roundness(file) {
  const { data, info } = await sharp(file).extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let area = 0, cx = 0, cy = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[y * W + x] > 127) {
        area++;
        cx += x;
        cy += y;
      }
  cx /= area;
  cy /= area;
  const r2 = area / Math.PI;
  let inside = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (data[y * W + x] > 127 && (x - cx) ** 2 + (y - cy) ** 2 <= r2) inside++;
  return inside / (2 * area - inside);
}

// The silhouette, cropped to its outline and centred on white.
async function image(file, flip) {
  let img = sharp(file).trim();
  if (flip) img = img.flop();
  const clear = { r: 255, g: 255, b: 255, alpha: 0 };
  const rgb = await img
    .resize(SIDE - 2 * PAD, SIDE - 2 * PAD, { fit: "contain", background: clear })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: clear })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return new RawImage(new Uint8ClampedArray(rgb), SIDE, SIDE, 3);
}

// The model's summary (CLS) vector, for the silhouette plus its mirror image.
async function embed(extract, file) {
  const sum = [];
  for (const flip of [false, true]) {
    const out = await extract(await image(file, flip));
    const width = out.dims.at(-1);
    out.data.slice(0, width).forEach((x, i) => (sum[i] = (sum[i] ?? 0) + x));
  }
  return sum;
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

function unit(v) {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

// Nearest-neighbour path through `nodes` from `start`, then 2-opt: reverse
// any stretch (never the start) whose reversal shortens the path, until none
// does. Forbidden steps cost FORBIDDEN, so 2-opt reverses them away.
function shortPath(D, nodes, start) {
  const n = nodes.length;
  const left = new Set(nodes);
  const path = [start];
  left.delete(start);
  while (path.length < n) {
    const at = path.at(-1);
    let next = -1;
    for (const j of left) if (next < 0 || D[at][j] < D[at][next]) next = j;
    path.push(next);
    left.delete(next);
  }
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Reversing path[i..j] swaps edges (i-1, i) and (j, j+1) for (i-1, j) and (i, j+1).
        const a = path[i - 1], b = path[i], c = path[j], d = path[j + 1];
        const before = D[a][b] + (d === undefined ? 0 : D[c][d]);
        const after = D[a][c] + (d === undefined ? 0 : D[b][d]);
        if (after < before - 1e-9) {
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return path;
}

async function main() {
  const ids = (await readdir(SIL))
    .map((f) => Number.parseInt(f, 10))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const chain = await chains();
  // Only species that have relatives need a chain entry.
  const size = {};
  for (const id of ids) size[chain[id]] = (size[chain[id]] ?? 0) + 1;
  const relatives = Object.fromEntries(ids.filter((id) => size[chain[id]] > 1).map((id) => [id, chain[id]]));

  const curated = await readCurated();
  if (curated) {
    const result = await publish(curated, relatives, "curated");
    if (result.missing.length) console.log(`  ${result.missing.length} species missing from curated.json, added as a last group`);
    if (result.unknown.length) console.log(`  dropped unknown or repeated ids: ${result.unknown.join(", ")}`);
    if (!result.published)
      throw new Error(`curated.json puts relatives side by side: ${result.kin.map((p) => p.join("+")).join(", ")}`);
    console.log(`Wrote public/lookalikes.json from curated.json: ${result.round.length} round, ${result.runs.length} groups`);
    return;
  }

  const cache = JSON.parse(await readFile(CACHE, "utf8").catch(() => "{}"));
  let extract;
  let embedded = 0;
  const vectors = [];
  for (const id of ids) {
    const file = await readFile(path.join(SIL, `${id}.webp`));
    const key = createHash("sha256").update(file).digest("hex");
    if (cache[id]?.key !== key) {
      extract ??= await pipeline("image-feature-extraction", MODEL, { dtype: "fp32" });
      cache[id] = { key, v: await embed(extract, file) };
      if (++embedded % 100 === 0) console.log(`  embedded ${embedded}…`);
    }
    cache[id].round ??= await roundness(file);
    vectors.push(unit(cache[id].v));
  }
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));

  const mean = vectors[0].map((_, k) => vectors.reduce((s, v) => s + v[k], 0) / vectors.length);
  const centred = vectors.map((v) => unit(v.map((x, k) => x - mean[k])));
  const kin = (i, j) => chain[ids[i]] === chain[ids[j]];
  const D = centred.map((a, i) => centred.map((b, j) => (i !== j && kin(i, j) ? FORBIDDEN : 1 - dot(a, b))));

  // The round opening, roundest first, skipping ahead past a relative of the
  // card before (Voltorb, then Electrode, would break the rule).
  const roundest = [...ids.keys()].filter((i) => cache[ids[i]].round >= ROUND_MIN);
  roundest.sort((a, b) => cache[ids[b]].round - cache[ids[a]].round);
  const opening = [];
  while (roundest.length) {
    const prev = opening.at(-1);
    const k = Math.max(0, roundest.findIndex((i) => prev === undefined || !kin(prev, i)));
    opening.push(...roundest.splice(k, 1));
  }
  // The rest continue from whichever lookalike is closest to the last circle.
  const rest = [...ids.keys()].filter((i) => !opening.includes(i));
  const last = opening.at(-1);
  const start = rest.reduce((best, i) => (D[last][i] < D[last][best] ? i : best));
  const tail = shortPath(D, rest, start);
  const walk = [...opening, ...tail];

  const broken = walk.slice(1).filter((j, k) => kin(walk[k], j));
  if (broken.length) throw new Error(`same-chain neighbours remain at ${broken.map((j) => ids[j]).join(", ")}`);

  // Cut the path after the opening at its largest steps.
  const steps = tail.slice(1).map((j, k) => D[tail[k]][j]);
  const cutAt = [...steps].sort((a, b) => b - a)[Math.floor(steps.length * CUT_SHARE)];
  const cuts = new Set(steps.flatMap((d, k) => (d > cutAt ? [k + 1] : [])));
  const split = (from, to) => {
    if (to - from <= MAX_RUN) return;
    let at = from + 1;
    for (let k = from + 1; k < to; k++) if (steps[k - 1] > steps[at - 1]) at = k;
    cuts.add(at);
    split(from, at);
    split(at, to);
  };
  const bounds = [0, ...[...cuts].sort((a, b) => a - b), tail.length];
  bounds.slice(1).forEach((to, k) => split(bounds[k], to));
  const edges = [0, ...[...cuts].sort((a, b) => a - b), tail.length];
  const runs = edges.slice(1).map((to, k) => tail.slice(edges[k], to).map((i) => ids[i]));

  const round = opening.map((i) => ids[i]);
  await writeFile(OUT, JSON.stringify({ model: MODEL, round, runs, chains: relatives }) + "\n");
  const length = walk.slice(1).reduce((s, j, k) => s + D[walk[k]][j], 0);
  const lengths = runs.map((r) => r.length);
  console.log(
    `Wrote public/lookalikes.json: ${walk.length} species, ${round.length} round ones first, ${runs.length} runs of ${Math.min(...lengths)}–${Math.max(...lengths)} (${embedded} newly embedded), mean step ${(length / (walk.length - 1)).toFixed(3)}`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
