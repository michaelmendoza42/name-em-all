#!/usr/bin/env node
// Builds the suggestion themes for the /curate page: sets of species that are
// confusing together, which can be gathered into a group there.
//
//   scripts/lookalikes/themes.json   [{ "key", "label", "source", "ids": [id, ...] }, ...]
//
// Three sources:
//   data    PokéAPI traits: babies, bugs, winged, four-legged, and animals by
//           category ("genus"), e.g. every "Fox Pokémon"
//   shape   measured from the silhouettes: blobby (a solid rounded mass once
//           thin bits like small spikes or ears are rubbed off), spiky (many
//           short thin bits) and long-limbed (a few big thin parts)
//   hand    hand-themes.json, by dex number: Paradox species with the
//           species they echo, regional "clone" archetypes, starters, deer
//           and horses, cats
//
// Labels describe the theme, never a species: the page shows no answers.
// Run with `npm run themes` (from the repo root, after installing this
// folder's packages).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIL = path.join(ROOT, "public", "sil");
const HAND = path.join(ROOT, "scripts", "lookalikes", "hand-themes.json");
const OUT = path.join(ROOT, "scripts", "lookalikes", "themes.json");
const TRAITS = path.join(ROOT, "scripts", ".cache", "lookalikes", "traits.json");
const GRAPHQL = "https://graphql.pokeapi.co/v1beta2";

// Species traits from PokéAPI (cached; delete to refresh).
async function traits() {
  const cached = await readFile(TRAITS, "utf8").catch(() => null);
  if (cached) return JSON.parse(cached);
  const query = `{ pokemonspecies(order_by: { id: asc }) {
    id is_baby
    pokemonshape { name }
    pokemonspeciesnames(where: { language_id: { _eq: 9 } }) { genus }
    pokemonegggroups { egggroup { name } }
    pokemons(where: { is_default: { _eq: true } }) { pokemontypes { type { name } } }
  } }`;
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`PokéAPI GraphQL returned ${res.status}`);
  const rows = (await res.json()).data.pokemonspecies.map((s) => ({
    id: s.id,
    baby: s.is_baby,
    shape: s.pokemonshape?.name ?? null,
    genus: s.pokemonspeciesnames[0]?.genus ?? "",
    eggs: s.pokemonegggroups.map((e) => e.egggroup.name),
    types: s.pokemons.flatMap((p) => p.pokemontypes.map((t) => t.type.name)),
  }));
  await mkdir(path.dirname(TRAITS), { recursive: true });
  await writeFile(TRAITS, JSON.stringify(rows));
  return rows;
}

// Distance (in pixels, chamfer) from each pixel to the nearest pixel outside `inside`.
function distance(inside, side) {
  const d = Float32Array.from(inside, (v) => (v ? 1e9 : 0));
  const at = (x, y) => (x < 0 || y < 0 || x >= side || y >= side ? 0 : d[y * side + x]);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (d[i]) d[i] = Math.min(d[i], at(x, y - 1) + 1, at(x - 1, y) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  for (let y = side - 1; y >= 0; y--)
    for (let x = side - 1; x >= 0; x--) {
      const i = y * side + x;
      if (d[i]) d[i] = Math.min(d[i], at(x, y + 1) + 1, at(x + 1, y) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  return d;
}

// Sizes of the 4-connected patches in `mask` of at least `min` pixels.
function patches(mask, side, min) {
  const seen = new Uint8Array(mask.length);
  const sizes = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let n = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % side;
      for (const j of [x > 0 ? i - 1 : -1, x < side - 1 ? i + 1 : -1, i - side, i + side])
        if (j >= 0 && j < mask.length && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    if (n >= min) sizes.push(n);
  }
  return sizes;
}

function hullArea(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts) => {
    const h = [];
    for (const p of pts) {
      while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  const hull = [...half(points), ...half([...points].reverse())];
  let area = 0;
  hull.forEach(([x1, y1], i) => {
    const [x2, y2] = hull[(i + 1) % hull.length];
    area += x1 * y2 - x2 * y1;
  });
  return Math.abs(area) / 2;
}

const FIT = 128; // silhouettes are measured fitted into 128×128
const RUB = 7; // thin = narrower than 2×7px there (an opening of radius 7)

// thin: share of the silhouette that's thin parts; coreSolidity: how close
// what's left is to its convex hull; parts / biggestPart: the thin parts.
async function measure(id) {
  const alpha = await sharp(await readFile(path.join(SIL, `${id}.webp`)))
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const black = { r: 0, g: 0, b: 0 };
  const side = FIT + 8;
  const pixels = await sharp(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } })
    .trim({ background: "#000000", threshold: 10 })
    .resize(FIT, FIT, { fit: "contain", background: black, kernel: "nearest" })
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: black })
    .toColourspace("b-w")
    .extractChannel(0)
    .raw()
    .toBuffer();
  const mask = Uint8Array.from(pixels, (v) => (v > 127 ? 1 : 0));
  const area = mask.reduce((a, b) => a + b, 0);
  const core = Uint8Array.from(distance(mask, side), (v) => (v >= RUB ? 0 : 1)); // 0 = deep inside
  const opened = Uint8Array.from(distance(core, side), (v, i) => (v <= RUB && mask[i] ? 1 : 0));
  const openedArea = opened.reduce((a, b) => a + b, 0);
  const thinParts = patches(
    Uint8Array.from(mask, (v, i) => (v && !opened[i] ? 1 : 0)),
    side,
    12,
  );
  const points = [];
  opened.forEach((v, i) => v && points.push([i % side, Math.floor(i / side)]));
  return {
    thin: 1 - openedArea / area,
    coreSolidity: points.length ? openedArea / hullArea(points) : 0,
    parts: thinParts.length,
    biggestPart: thinParts.length ? Math.max(...thinParts) / area : 0,
  };
}

async function main() {
  const rows = await traits();
  const themes = [];
  const add = (key, label, source, ids) => ids.length && themes.push({ key, label, source, ids });

  // Data.
  const genus = (words) => rows.filter((r) => new RegExp(`\\b(${words})\\b`, "i").test(r.genus)).map((r) => r.id);
  add("babies", "Babies", "data", rows.filter((r) => r.baby).map((r) => r.id));
  add(
    "bugs",
    "Bugs",
    "data",
    rows.filter((r) => r.types.includes("bug") || r.eggs.includes("bug") || r.shape === "bug-wings").map((r) => r.id),
  );
  add("winged", "Winged", "data", rows.filter((r) => r.shape === "wings").map((r) => r.id));
  add("dogs", "Dogs, foxes & wolves", "data", genus("Dog|Puppy|Fox|Wolf|Jackal|Hound|Coyote"));
  add("mice", "Mice & rodents", "data", genus("Mouse|Rat|Squirrel|Hamster|Chinchilla|Rodent"));
  add("monkeys", "Monkeys & apes", "data", genus("Monkey|Ape|Chimp|Gorilla|Primate"));
  add("snakes", "Snakes & serpents", "data", genus("Snake|Serpent|Cobra|Viper|Python"));

  // Shape. Four-legged ones are listed with the most thin parts (long tails,
  // legs, necks) first.
  const metrics = {};
  for (const r of rows) metrics[r.id] = await measure(r.id);
  const by = (ids, key, dir) => ids.sort((a, b) => dir * (metrics[a][key] - metrics[b][key]));
  const all = rows.map((r) => r.id);
  add("blobby", "Blobby", "shape", by(all.filter((i) => metrics[i].thin <= 0.06 && metrics[i].coreSolidity >= 0.85), "thin", 1));
  add(
    "spiky",
    "Spiky",
    "shape",
    by(all.filter((i) => metrics[i].parts >= 11 && metrics[i].thin >= 0.12 && metrics[i].biggestPart < 0.05), "parts", -1),
  );
  add(
    "limbs",
    "Long limbs",
    "shape",
    by(all.filter((i) => metrics[i].biggestPart >= 0.09 && metrics[i].parts <= 8), "biggestPart", -1),
  );
  add(
    "four-legged",
    "Four-legged (long tails first)",
    "shape",
    by(rows.filter((r) => r.shape === "quadruped").map((r) => r.id), "thin", -1),
  );

  // Hand.
  const hand = JSON.parse(await readFile(HAND, "utf8"));
  const known = new Set(all);
  const unknown = Object.values(hand).flat(2).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`hand-themes.json has unknown dex numbers: ${unknown.join(", ")}`);
  hand.paradox.forEach((ids, i) => add(`paradox-${i + 1}`, `Paradox set ${i + 1}`, "hand", ids));
  for (const [label, ids] of Object.entries(hand))
    if (label !== "paradox") add(label.toLowerCase().replace(/\W+/g, "-"), label, "hand", ids);

  await writeFile(OUT, JSON.stringify(themes, null, 1) + "\n");
  console.log(`Wrote scripts/lookalikes/themes.json: ${themes.length} themes`);
  for (const t of themes) console.log(`  ${t.label}: ${t.ids.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
