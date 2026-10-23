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
//   public/sprites/back/<gen>/<id>.<ext>, public/icons/<gen>/<id>.<ext>
//                            the same games' back sprites and menu/box icons
//                            (downloaded, not shown yet)
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
// Per-generation sprites from each generation's games, tried in order. Each
// set lands in public/<dir>/<gen>/<id>.<ext>, and the generations a species
// has are listed on it in pokedex.json under `field`. Output extensions must
// match src/lib/sprites.ts.
//
// How a file is prepared (all optional):
//   from        source extension, when it differs from the output's
//   still       keep only the first frame; with size, resize to size×size
//   whiteToAlpha  Gens I–II backs have no transparent version: clear the
//               white background, flood-filled in from the edges so white
//               inside the outline stays
//   webp        re-encode a large PNG as WebP
// Sets with crop: true also trim still sprites to their visible pixels.
//
// Gens I–VI ship as-is (Gen V's animate). Gen VII's animated GIFs average
// 165 KB (130 MB in all), and Gens VIII–IX are 512px animated renders of
// 0.4–2.6 MB each, so those ship as a still first frame, VIII–IX resized.
const VERSIONS = `${SPRITES}/versions`;
const RENDER_STILL = { from: "webp", size: 192 };
const SPRITE_SETS = [
  {
    name: "front sprites",
    dir: "sprites",
    field: "sprites",
    crop: true,
    gens: [
      { gen: 1, ext: "png", sources: ["generation-i/red-blue/transparent"] },
      { gen: 2, ext: "png", sources: ["generation-ii/crystal/transparent"] },
      { gen: 3, ext: "png", sources: ["generation-iii/emerald"] },
      { gen: 4, ext: "png", sources: ["generation-iv/platinum"] },
      { gen: 5, ext: "gif", sources: ["generation-v/black-white/animated"] },
      { gen: 6, ext: "png", sources: ["generation-vi/x-y"] },
      { gen: 7, ext: "png", from: "gif", still: {}, sources: ["generation-vii/ultra-sun-ultra-moon"] },
      {
        gen: 8,
        ext: "webp",
        still: RENDER_STILL,
        sources: ["generation-viii/sword-shield", "generation-viii/legends-arceus"],
      },
      { gen: 9, ext: "webp", still: RENDER_STILL, sources: ["generation-ix/scarlet-violet"] },
    ],
  },
  {
    name: "back sprites",
    dir: "sprites/back",
    field: "backSprites",
    crop: true,
    gens: [
      { gen: 1, ext: "png", whiteToAlpha: true, sources: ["generation-i/red-blue/back"] },
      { gen: 2, ext: "png", whiteToAlpha: true, sources: ["generation-ii/crystal/back"] },
      { gen: 3, ext: "png", sources: ["generation-iii/emerald/back"] },
      { gen: 4, ext: "png", sources: ["generation-iv/platinum/back"] },
      { gen: 5, ext: "gif", sources: ["generation-v/black-white/animated/back"] },
      { gen: 6, ext: "png", sources: ["generation-vi/x-y/back"] },
      { gen: 7, ext: "png", from: "gif", still: {}, sources: ["generation-vii/ultra-sun-ultra-moon/back"] },
      {
        gen: 8,
        ext: "webp",
        still: RENDER_STILL,
        sources: ["generation-viii/sword-shield/back", "generation-viii/legends-arceus/back"],
      },
      { gen: 9, ext: "webp", still: RENDER_STILL, sources: ["generation-ix/scarlet-violet/back"] },
    ],
  },
  {
    // Menu / box icons. Gens III–V's are often the same file.
    name: "icons",
    dir: "icons",
    field: "icons",
    gens: [
      { gen: 3, ext: "png", sources: ["generation-iii/icons"] },
      { gen: 4, ext: "png", sources: ["generation-iv/icons"] },
      { gen: 5, ext: "png", sources: ["generation-v/icons"] },
      { gen: 6, ext: "png", sources: ["generation-vi/icons"] },
      { gen: 7, ext: "png", sources: ["generation-vii/icons"] },
      { gen: 8, ext: "png", sources: ["generation-viii/sword-shield/icons"] },
      { gen: 9, ext: "webp", from: "png", webp: true, sources: ["generation-ix/scarlet-violet/icons"] },
    ],
  },
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

// Clears the white background of a sprite drawn on white: every white
// pixel reachable from the edge through other white pixels turns transparent.
async function whiteToAlpha(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const white = (i) => data[i * 4] >= 248 && data[i * 4 + 1] >= 248 && data[i * 4 + 2] >= 248;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !white(i)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png({ palette: true });
}

// Crops a still sprite to its visible pixels, so it stands on its platform in
// a battle scene instead of floating in its canvas's empty margin. Animated
// GIFs ship as-is; theirs are already cropped tight.
async function cropToContent(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0 || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return file;
  const cropped = sharp(file).extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
  const { format } = await sharp(file).metadata();
  return (format === "webp" ? cropped.webp({ quality: 80, alphaQuality: 90 }) : cropped.png({ palette: true })).toBuffer();
}

async function prepareSprite(file, spec, crop) {
  let out = file;
  if (spec.still?.size) {
    out = await sharp(file, { page: 0 })
      .resize(spec.still.size, spec.still.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80, alphaQuality: 90 })
      .toBuffer();
  } else if (spec.still) out = await sharp(file, { page: 0 }).png({ palette: true }).toBuffer();
  else if (spec.whiteToAlpha) out = await (await whiteToAlpha(file)).toBuffer();
  else if (spec.webp) out = await sharp(file).webp({ quality: 85, alphaQuality: 90 }).toBuffer();
  return crop && spec.ext !== "gif" ? cropToContent(out) : out;
}

// Builds one set's files for every generation the species existed in and
// returns those generations. Known 404s are remembered in scripts/.cache so
// re-runs don't ask again.
async function buildSpriteSet(entry, set, missing) {
  const gens = [];
  for (const spec of set.gens) {
    if (spec.gen < entry.generation) continue;
    const out = path.join(PUBLIC, set.dir, String(spec.gen), `${entry.id}.${spec.ext}`);
    const key = `${set.dir}/${spec.gen}/${entry.id}`;
    if (!FORCE_IMAGES && (await exists(out))) {
      gens.push(spec.gen);
      continue;
    }
    if (!FORCE_IMAGES && missing.has(key)) continue;
    let found = false;
    for (const source of spec.sources) {
      const file = await fetchFile(`${VERSIONS}/${source}/${entry.artworkId}.${spec.from ?? spec.ext}`);
      if (!file) continue;
      await writeFile(out, await prepareSprite(file, spec, set.crop));
      found = true;
      break;
    }
    if (found) gens.push(spec.gen);
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

  for (const set of SPRITE_SETS) {
    await Promise.all(set.gens.map(({ gen }) => mkdir(path.join(PUBLIC, set.dir, String(gen)), { recursive: true })));
  }
  const missingSprites = new Set(await readFile(SPRITES_MISSING, "utf8").then(JSON.parse, () => []));
  const spriteFailures = await runPool(entries, 12, async (e) => {
    for (const set of SPRITE_SETS) e[set.field] = await buildSpriteSet(e, set, missingSprites);
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
  for (const set of SPRITE_SETS) {
    const counts = set.gens.map(({ gen }) => {
      const have = entries.filter((e) => e[set.field].includes(gen)).length;
      return `${gen}: ${have}/${entries.filter((e) => e.generation <= gen).length}`;
    });
    console.log(`  ${set.name} by gen — ${counts.join(", ")}`);
  }

  await buildDexEntries(entries);

  const dataset = {
    source: "PokéAPI (graphql.pokeapi.co) + PokeAPI/sprites official artwork",
    generatedAt: new Date().toISOString(),
    count: entries.length,
    species: entries.map(({ id, slug, name, generation, types, animated, sprites, backSprites, icons }) => ({
      id,
      slug,
      name,
      generation,
      types,
      animated,
      sprites,
      backSprites,
      icons,
    })),
  };
  await writeFile(path.join(PUBLIC, "pokedex.json"), JSON.stringify(dataset) + "\n");
  console.log(`Wrote public/pokedex.json (${dataset.count} species)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
