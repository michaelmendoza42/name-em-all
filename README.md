# Gotta Name 'Em All (name-em-all)

One continuous wall of every Pokémon species as a silhouette. Type a name under
a silhouette and it reveals the moment the name matches (no Enter; wrong text
has no effect). Tab jumps between unsolved boxes. Hints are free and unlimited.
Progress is saved in this browser only (localStorage). No account, no backend.

## Modes

The app is in one mode at a time (saved as `wtp-ultimate:mode`):

- **Pokédex** (`/`): National Dex order, one section per generation, with hints.
- **Hard Mode** (`/hard-mode`): one flat wall that opens with every
  near-circular silhouette, then orders the rest so each sits beside its
  closest lookalikes (`public/lookalikes.json`, see Data). Two Pokémon from the
  same evolution chain are never consecutive (rows may still stack them
  vertically). No hints, no dex numbers until solved, no "fill in the original
  151" shortcut. Solved cards stay in the wall until their whole generation is
  named; then that generation leaves the wall for its own Pokédex section below
  it, and the page glides there for the level-up.
- Everyone's first Hard Mode run gets the same (canonical) wall. Each later
  run (after leaving and coming back) gets its own arrangement, saved as a
  seed in `wtp-ultimate:hard-run` so reloads keep it: the round opening is
  shuffled, the runs of lookalikes are shuffled, and each run is shuffled
  within itself, with the evolution-chain rule re-checked everywhere. The
  confirmation never mentions the lookalike grouping or the generation
  sections; they're surprises.

Switching lives in the ⋯ menu ("Hard Mode…" / "Back to the Pokédex…"; the
bar shows a Hard Mode badge while it's on). It always asks first, and it's one-sided so the Pokédex can never be
used to look up Hard Mode answers: Hard Mode starts from zero (Pokédex progress
doesn't count toward it and is kept aside), and leaving Hard Mode erases its
progress and brings the Pokédex progress back. A link to the other mode's path
opens that question rather than switching.

## Run

```bash
npm install
npm run dev        # http://<host>:5196 (bound to 0.0.0.0)
npm test           # vitest: answers, aliases, hints, persistence, dataset coverage, tile behavior
npm run build      # typecheck + production build into dist/
```

`public/` already contains the generated dataset and images. To regenerate:

```bash
npm run data                  # fetch species from PokéAPI, build missing images
npm run data -- --force-images
npm --prefix scripts/lookalikes install   # once: the model runtime (~1.5 GB)
npm run lookalikes            # reorder Hard Mode after silhouettes change
```

### Curating Hard Mode by hand

`npm run dev`, then open `/curate` (dev server only; production builds leave it
out). It shows the round opening and every lookalike group as silhouettes, no
names. Drag silhouettes within or across groups, or into the slim gap between
groups to start a new one; drag a group's ⠿ handle to move the group; click to
select several and drag them together. Ctrl+Z undoes, Ctrl+S saves.

Saving writes `scripts/lookalikes/curated.json`, which is then **canonical**:
`npm run lookalikes` publishes it as is instead of the model's order. It also
republishes `public/lookalikes.json` straight away, unless two relatives sit
side by side (outlined in red), in which case it saves but doesn't publish.
Delete `curated.json` to go back to the model's arrangement.

The page's **Suggestions** panel lists themes that are confusing together, from
`scripts/lookalikes/themes.json` (`npm run themes` rebuilds it): silhouette
shapes (blobby, spiky, long limbs, four-legged), PokéAPI categories (babies,
bugs, winged, animals by category) and hand-picked sets in
`hand-themes.json`, written as dex numbers (Paradox species with the ones they
echo, regional clone archetypes, starters, deer and horses, cats). Hover a
theme to outline its members on the board, drag members out, or Gather the
whole set into a new group. Theme labels never name a species.

## Deploy (Docker + Portainer on mmdebian)

Production is a static nginx image run as the Portainer stack `name-em-all` on
host port 8091, published at `https://name-em-all.michaelmendoza.me` through
Nginx Proxy Manager.

```bash
# Build from committed code only (tests must pass or the build fails):
git archive HEAD | docker build --build-arg REVISION=$(git rev-parse HEAD) -t name-em-all:latest -
```

- **First time:** Portainer → Stacks → Add stack → Web editor, name it
  `name-em-all`, paste `compose.portainer.yaml`, Deploy.
- **Updates:** rebuild the image as above, then Portainer → the stack →
  Update the stack (leave "re-pull image" off).
- Player progress lives in each visitor's browser (localStorage), so redeploys
  never touch it.

## Data

- **Species, names, types**: [PokéAPI](https://pokeapi.co) GraphQL, one query
  (`scripts/build-data.mjs`). One entry per species (National Dex #1–#1025, generations 1–9),
  using each species' default form for types and artwork. Forms,
  Megas, regional variants and costumes are not separate tiles.
- **Types** are the current-generation types (e.g. Clefairy is Fairy, Mr. Mime is Psychic/Fairy).
- **Artwork**: PokeAPI/sprites official artwork, resized to 256×256 WebP (`public/art`).
- **Silhouettes**: cut from the same artwork by keeping only its alpha channel
  and painting it black (`public/sil`), so silhouette files contain no color or detail.
- **Lookalikes** (`scripts/lookalikes/`, its own package so the app never
  installs the model runtime): each silhouette, cropped to its outline, is
  embedded with the DINOv2-base vision model (silhouette + mirror image, so
  facing doesn't matter; centred on the average embedding). The wall order is
  a short path through those embeddings: nearest neighbour, then 2-opt. It
  opens with silhouettes whose overlap with a same-area disc is ≥ 0.84
  (roundest first). Same-chain steps (PokéAPI evolution chains) are priced
  out of the path, and the build fails if one survives. The path after the
  opening is cut into runs (at its largest 12% of steps, then at most 30
  long) that later Hard Mode runs reshuffle.
  Picked by scoring how often a silhouette's 5 nearest neighbours share its
  PokéAPI body shape: pixel overlap 19%, DINOv2-small 35%, DINOv2-base 40%
  (random pairs: 13%). Embeddings are cached in `scripts/.cache/lookalikes`.
- **Sprites by generation** (the picture of a flipped solved card, a swipeable
  carousel): each generation's in-game sprite from PokeAPI/sprites
  (`public/sprites/<gen>/<id>.*`): Red/Blue, Crystal, Emerald, Platinum,
  Black/White (animated), X/Y, Ultra Sun/Moon, Sword/Shield (Legends: Arceus
  for Hisui), Scarlet/Violet. Gens VII–IX ship as still first frames (their
  animations run 0.2–2.6 MB each); VIII–IX are resized to 192px. Then the
  modern animated sprite (`public/anim`) when it differs from Gen V's.
- **Back sprites** (the near half of each carousel battle scene):
  `public/sprites/back/<gen>/<id>.*` from the same games as the fronts and in
  the same formats (Gens I–II cut from their white backgrounds).
- **Menu/box icons** (an unlock: completing a generation unlocks its game's
  icon style, and completing every generation unlocks Gens I–II's. A completed
  generation's header then has a picker that swaps its cards' front artwork for
  any unlocked style its species appear in, remembered per generation. On the
  dev server only, the ⋯ menu can complete or clear any generation for testing):
  `public/icons/<gen>/<id>.*` for Gens III–IX from PokeAPI/sprites
  (Gen IX's as WebP), plus Gens I–II's shared party shapes by body type (Red/Blue
  and Crystal), built from the [pret](https://github.com/pret) disassemblies'
  graphics and species tables. Cropped to their visible pixels and shown at
  2× native size (whole pixels, so they stay sharp); Gen IX's smooth renders share one scale that just fits the largest. A species
  missing from the chosen game uses its nearest older unlocked icon, else newer.
- Each species lists the generations it has as `sprites`, `backSprites` and
  `icons` in `pokedex.json`; paths come from `src/lib/sprites.ts`.
- **Pokédex entries** (the footer of a flipped solved card): PokéAPI's English flavor
  text, one file per species (`public/dex/<id>.json`, fetched on first flip),
  grouped by the generation of the game. Line breaks and soft hyphens are
  flowed into sentences, old all-caps names (PIKACHU, POKéMON) are written the
  modern way, and games in one generation with identical text share an entry.
- The build script fails if the species count differs from PokéAPI's reported
  total, if numbering has gaps, or if any species lacks an English name or types.
  The app re-checks completeness when it loads `pokedex.json` and shows an error
  rather than a partial wall.

## Answers

`normalizeAnswer` lowercases, strips accents, maps ♀/♂ to f/m and removes
everything except letters and digits, so `mr mime`, `Flabebe` and
`farfetch'd` all match. Genuinely different names live in
`src/lib/aliases.ts`, keyed by species slug. Any key that two species share
(for example plain "Nidoran") is ambiguous and is accepted for neither. There is no fuzzy matching.

## Progress storage

Key `wtp-ultimate:progress` (Pokédex mode; Hard Mode uses
`wtp-ultimate:progress:hard`, same shape):

```json
{ "version": 1, "pokemon": { "25": { "solved": true, "artwork": false, "letters": 3 } } }
```

Keys are National Dex numbers. Malformed values are dropped or clamped.
Unreadable or unknown-version saves are copied to `wtp-ultimate:progress:unreadable-backup`
before the app starts fresh. If storage is unavailable, the game runs in memory and says so in the header.
