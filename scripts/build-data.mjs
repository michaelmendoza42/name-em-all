#!/usr/bin/env node
// Builds the wall's dataset and images from PokéAPI.
//
//   public/pokedex.json      species list (id, slug, English name, types)
//   public/art/<id>.webp     full-color official artwork, resized
//   public/sil/<id>.webp     solid black silhouette cut from the same artwork
//
// Re-run with `npm run data`. Downloads are cached in scripts/.cache, so
// re-runs only fetch what's missing. Pass --force-images to rebuild images.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const CACHE = path.join(ROOT, "scripts", ".cache", "artwork");
const GRAPHQL = "https://graphql.pokeapi.co/v1beta2";
const ARTWORK = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const IMAGE_SIZE = 256;
const ENGLISH = 9;
const FORCE_IMAGES = process.argv.includes("--force-images");

const QUERY = `{
  pokemonspecies_aggregate { aggregate { count } }
  pokemonspecies(order_by: { id: asc }) {
    id
    name
    generation_id
    pokemonspeciesnames(where: { language_id: { _eq: ${ENGLISH} } }) { name }
    pokemons(where: { is_default: { _eq: true } }) {
      id
      pokemontypes(order_by: { slot: asc }) { type { name } }
    }
  }
}`;

async function fetchSpecies() {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`PokéAPI GraphQL returned ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`PokéAPI GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function toEntries(data) {
  const expected = data.pokemonspecies_aggregate.aggregate.count;
  const problems = [];
  const entries = data.pokemonspecies.map((s) => {
    const name = s.pokemonspeciesnames[0]?.name;
    const pokemon = s.pokemons[0];
    const types = pokemon?.pokemontypes.map((t) => t.type.name) ?? [];
    if (!name) problems.push(`#${s.id} ${s.name}: no English name`);
    if (!pokemon) problems.push(`#${s.id} ${s.name}: no default Pokémon`);
    if (types.length < 1 || types.length > 2) problems.push(`#${s.id} ${s.name}: ${types.length} types`);
    return { id: s.id, slug: s.name, name, generation: s.generation_id, types, artworkId: pokemon?.id };
  });

  // The wall must never silently present an incomplete Pokédex.
  if (entries.length !== expected) problems.push(`got ${entries.length} species, PokéAPI reports ${expected}`);
  entries.forEach((e, i) => {
    if (e.id !== i + 1) problems.push(`gap in National Dex numbering at position ${i + 1} (found #${e.id})`);
  });
  const names = new Set();
  for (const e of entries) {
    if (names.has(e.name)) problems.push(`duplicate name ${e.name}`);
    names.add(e.name);
  }
  if (problems.length) throw new Error(`Dataset failed validation:\n  ${problems.join("\n  ")}`);
  return entries;
}

const exists = (p) => access(p).then(() => true, () => false);

async function downloadArtwork(artworkId) {
  const file = path.join(CACHE, `${artworkId}.png`);
  if (await exists(file)) return readFile(file);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ARTWORK(artworkId));
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      return buf;
    }
    if (attempt >= 4) throw new Error(`artwork ${artworkId}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function buildImages(entry) {
  const artOut = path.join(PUBLIC, "art", `${entry.id}.webp`);
  const silOut = path.join(PUBLIC, "sil", `${entry.id}.webp`);
  if (!FORCE_IMAGES && (await exists(artOut)) && (await exists(silOut))) return;

  const source = await downloadArtwork(entry.artworkId);
  const resized = sharp(source)
    .ensureAlpha()
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });

  await resized.clone().webp({ quality: 82, alphaQuality: 90 }).toFile(artOut);

  // Silhouette: keep only the alpha channel and paint every pixel black, so
  // no color or interior detail survives in the file itself.
  const alpha = await resized.clone().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  const { width, height } = alpha.info;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = alpha.data[i];
  await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ lossless: true }).toFile(silOut);
}

async function runPool(items, limit, worker) {
  let next = 0;
  let done = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await worker(item);
        } catch (err) {
          failures.push(`#${item.id}: ${err.message}`);
        }
        if (++done % 100 === 0 || done === items.length) process.stdout.write(`  images ${done}/${items.length}\n`);
      }
    }),
  );
  return failures;
}

async function main() {
  await Promise.all(["art", "sil"].map((d) => mkdir(path.join(PUBLIC, d), { recursive: true })));
  await mkdir(CACHE, { recursive: true });

  console.log("Fetching species from PokéAPI…");
  const entries = toEntries(await fetchSpecies());
  console.log(`  ${entries.length} species, #1–#${entries.at(-1).id}`);

  const failures = await runPool(entries, 12, buildImages);
  if (failures.length) throw new Error(`Image build failed for ${failures.length} species:\n  ${failures.join("\n  ")}`);

  const dataset = {
    source: "PokéAPI (graphql.pokeapi.co) + PokeAPI/sprites official artwork",
    generatedAt: new Date().toISOString(),
    count: entries.length,
    species: entries.map(({ id, slug, name, generation, types }) => ({ id, slug, name, generation, types })),
  };
  await writeFile(path.join(PUBLIC, "pokedex.json"), JSON.stringify(dataset) + "\n");
  console.log(`Wrote public/pokedex.json (${dataset.count} species)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
