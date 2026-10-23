#!/usr/bin/env node
// Builds the wall's dataset and images from PokéAPI.
//
//   public/pokedex.json      species list (id, slug, English name, types)
//   public/art/<id>.webp     full-color official artwork, resized
//   public/sil/<id>.webp     solid black silhouette cut from the same artwork
//   public/anim/<id>.gif     animated sprite (shown when a solved card flips),
//                            where one exists
//   public/sprites/<gen>/<id>.<ext>
//                            the in-game sprite from each generation's games
//                            (swiped through on a flipped card)
//   public/dex/<id>.json     English Pokédex entries (flavor text) by
//                            generation, shown on the back of a flipped card
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
const ANIM_CACHE = path.join(ROOT, "scripts", ".cache", "anim");
const GRAPHQL = "https://graphql.pokeapi.co/v1beta2";
const ARTWORK = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
// Animated sprite sources, best first. Showdown covers the most species;
// Black/White fills gaps (its sprites above #650 are fan-made Gen 5 style).
const ANIM_SOURCES = [
  { name: "showdown", url: (id) => `${SPRITES}/other/showdown/${id}.gif` },
  { name: "black-white", url: (id) => `${SPRITES}/versions/generation-v/black-white/animated/${id}.gif` },
];
// One sprite per generation, from that generation's games, tried in order.
// Gens I–VI ship as-is (Gen V's animate). Gen VII's animated GIFs average
// 165 KB (130 MB in all), and Gens VIII–IX are 512px animated renders of
// 0.5–2.6 MB each, so those ship as a still first frame, VIII–IX resized.
// Output extensions must match src/lib/sprites.ts.
const VERSIONS = `${SPRITES}/versions`;
const GEN_SPRITES = [
  { gen: 1, ext: "png", sources: ["generation-i/red-blue/transparent"] },
  { gen: 2, ext: "png", sources: ["generation-ii/crystal/transparent"] },
  { gen: 3, ext: "png", sources: ["generation-iii/emerald"] },
  { gen: 4, ext: "png", sources: ["generation-iv/platinum"] },
  { gen: 5, ext: "gif", sources: ["generation-v/black-white/animated"] },
  { gen: 6, ext: "png", sources: ["generation-vi/x-y"] },
  { gen: 7, ext: "png", still: { from: "gif" }, sources: ["generation-vii/ultra-sun-ultra-moon"] },
  {
    gen: 8,
    ext: "webp",
    still: { from: "webp", size: 192 },
    sources: ["generation-viii/sword-shield", "generation-viii/legends-arceus"],
  },
  { gen: 9, ext: "webp", still: { from: "webp", size: 192 }, sources: ["generation-ix/scarlet-violet"] },
];
const SPRITES_MISSING = path.join(ROOT, "scripts", ".cache", "sprites-missing.json");
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

const FLAVOR_QUERY = `{
  pokemonspeciesflavortext(
    where: { language_id: { _eq: ${ENGLISH} } }
    order_by: [{ pokemon_species_id: asc }, { version_id: asc }]
  ) {
    pokemon_species_id
    flavor_text
    version {
      name
      versionnames(where: { language_id: { _eq: ${ENGLISH} } }) { name }
      versiongroup { generation_id }
    }
  }
}`;

// Retries the gateway errors (5xx) PokéAPI's GraphQL endpoint throws under load.
async function graphql(query) {
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (res.ok || res.status < 500 || attempt >= 6) break;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  if (!res.ok) throw new Error(`PokéAPI GraphQL returned ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`PokéAPI GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

const fetchSpecies = () => graphql(QUERY);

// Game text is laid out for small screens: hard line breaks, page breaks
// (\f), soft hyphens at line ends, and Gens 1–3 shout names in capitals.
// Flow it into plain sentences and write names the modern way.
function cleanFlavorText(text, capsNames) {
  return text
    .replace(/\u00ad\s*/g, "")
    .replace(/[\f\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/POK[ÉéE]MON/g, "Pokémon")
    .replace(/POK[ÉéE] ?BALL/g, "Poké Ball")
    .replace(/\bMR\. MIME\b|\bMIME JR\.|\b[A-Z]{3,}(?:['’][A-Z]+\b)?/g, (w) => capsNames.get(w.replace(/’/g, "'")) ?? w)
    .trim();
}

// One file per species: its entries grouped by the generation of the game
// they appeared in, oldest first. Games in the same generation that share a
// text (Red and Blue, X and Y) collapse into one entry listing both.
async function buildDexEntries(entries) {
  await mkdir(path.join(PUBLIC, "dex"), { recursive: true });
  // Capitalized names to rewrite, e.g. PIKACHU, FARFETCH'D, MR. MIME. Other
  // capitals (move names like TACKLE, BERRIES) are left as the games wrote them.
  const capsNames = new Map(entries.map((e) => [e.name.toUpperCase().replace(/’/g, "'"), e.name]));
  capsNames.set("NIDORAN", "Nidoran");
  const rows = (await graphql(FLAVOR_QUERY)).pokemonspeciesflavortext;
  const bySpecies = new Map();
  for (const r of rows) {
    const generation = r.version.versiongroup.generation_id;
    const version = r.version.versionnames[0]?.name ?? r.version.name;
    const text = cleanFlavorText(r.flavor_text, capsNames);
    if (!text) continue;
    const list = bySpecies.get(r.pokemon_species_id) ?? [];
    bySpecies.set(r.pokemon_species_id, list);
    const same = list.find((x) => x.generation === generation && x.text === text);
    if (same) same.versions.push(version);
    else list.push({ generation, versions: [version], text });
  }
  const missing = [];
  for (const e of entries) {
    const list = (bySpecies.get(e.id) ?? []).sort((a, b) => a.generation - b.generation);
    if (!list.length) missing.push(e.id);
    await writeFile(path.join(PUBLIC, "dex", `${e.id}.json`), JSON.stringify(list) + "\n");
  }
  console.log(`  Pokédex entries: ${rows.length} texts for ${entries.length - missing.length}/${entries.length} species`);
  if (missing.length) console.log(`  no Pokédex entries for #${missing.join(", #")}`);
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

// Returns true when public/anim/<id>.gif exists (copied now or earlier).
// GIFs ship as-is: re-encoding these small sprites as WebP made them larger
// (lossy) or barely smaller (lossless) at a much slower build.
async function buildAnimation(entry) {
  const out = path.join(PUBLIC, "anim", `${entry.id}.gif`);
  if (!FORCE_IMAGES && (await exists(out))) return true;
  for (const source of ANIM_SOURCES) {
    const file = path.join(ANIM_CACHE, `${source.name}-${entry.artworkId}.gif`);
    let gif;
    if (await exists(file)) gif = await readFile(file);
    else {
      const res = await fetch(source.url(entry.artworkId));
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`animation ${source.name} ${entry.artworkId}: HTTP ${res.status}`);
      gif = Buffer.from(await res.arrayBuffer());
      await writeFile(file, gif);
    }
    await writeFile(out, gif);
    return true;
  }
  return false;
}

// Fetches a URL, retrying network and 5xx errors; null on 404.
async function fetchFile(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status < 500 || attempt >= 4) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

// Builds public/sprites/<gen>/<id>.<ext> for every generation the species
// existed in and returns those generations. Known 404s are remembered in
// scripts/.cache so re-runs don't ask again.
async function buildGenSprites(entry, missing) {
  const gens = [];
  for (const { gen, ext, still, sources } of GEN_SPRITES) {
    if (gen < entry.generation) continue;
    const out = path.join(PUBLIC, "sprites", String(gen), `${entry.id}.${ext}`);
    const key = `${gen}/${entry.id}`;
    if (!FORCE_IMAGES && (await exists(out))) {
      gens.push(gen);
      continue;
    }
    if (!FORCE_IMAGES && missing.has(key)) continue;
    let found = false;
    for (const source of sources) {
      const file = await fetchFile(`${VERSIONS}/${source}/${entry.artworkId}.${still?.from ?? ext}`);
      if (!file) continue;
      if (still?.size) {
        await sharp(file, { page: 0 })
          .resize(still.size, still.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 80, alphaQuality: 90 })
          .toFile(out);
      } else if (still) {
        await sharp(file, { page: 0 }).png({ palette: true }).toFile(out);
      } else {
        await writeFile(out, file);
      }
      found = true;
      break;
    }
    if (found) gens.push(gen);
    else missing.add(key);
  }
  return gens;
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
  await Promise.all(["art", "sil", "anim"].map((d) => mkdir(path.join(PUBLIC, d), { recursive: true })));
  await mkdir(CACHE, { recursive: true });
  await mkdir(ANIM_CACHE, { recursive: true });

  console.log("Fetching species from PokéAPI…");
  const entries = toEntries(await fetchSpecies());
  console.log(`  ${entries.length} species, #1–#${entries.at(-1).id}`);

  const failures = await runPool(entries, 12, buildImages);
  if (failures.length) throw new Error(`Image build failed for ${failures.length} species:\n  ${failures.join("\n  ")}`);

  const animFailures = await runPool(entries, 12, async (e) => {
    e.animated = await buildAnimation(e);
  });
  if (animFailures.length) throw new Error(`Animation build failed:\n  ${animFailures.join("\n  ")}`);
  const missing = entries.filter((e) => !e.animated).map((e) => e.id);
  console.log(`  animated sprites: ${entries.length - missing.length}/${entries.length}`);
  if (missing.length) console.log(`  no animation for #${missing.join(", #")}`);

  await Promise.all(GEN_SPRITES.map(({ gen }) => mkdir(path.join(PUBLIC, "sprites", String(gen)), { recursive: true })));
  const missingSprites = new Set(await readFile(SPRITES_MISSING, "utf8").then(JSON.parse, () => []));
  const spriteFailures = await runPool(entries, 12, async (e) => {
    e.sprites = await buildGenSprites(e, missingSprites);
    // The Gen V slide already shows this animation when it came from Black/White.
    if (e.animated && e.sprites.includes(5)) {
      const [anim, bw] = await Promise.all([
        readFile(path.join(PUBLIC, "anim", `${e.id}.gif`)),
        readFile(path.join(PUBLIC, "sprites", "5", `${e.id}.gif`)),
      ]);
      if (anim.equals(bw)) e.animated = false;
    }
  });
  await writeFile(SPRITES_MISSING, JSON.stringify([...missingSprites].sort()) + "\n");
  if (spriteFailures.length) throw new Error(`Sprite build failed:\n  ${spriteFailures.join("\n  ")}`);
  for (const { gen } of GEN_SPRITES) {
    const have = entries.filter((e) => e.sprites.includes(gen)).length;
    console.log(`  Gen ${gen} sprites: ${have}/${entries.filter((e) => e.generation <= gen).length}`);
  }

  await buildDexEntries(entries);

  const dataset = {
    source: "PokéAPI (graphql.pokeapi.co) + PokeAPI/sprites official artwork",
    generatedAt: new Date().toISOString(),
    count: entries.length,
    species: entries.map(({ id, slug, name, generation, types, animated, sprites }) => ({
      id,
      slug,
      name,
      generation,
      types,
      animated,
      sprites,
    })),
  };
  await writeFile(path.join(PUBLIC, "pokedex.json"), JSON.stringify(dataset) + "\n");
  console.log(`Wrote public/pokedex.json (${dataset.count} species)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
