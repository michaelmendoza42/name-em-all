# Gotta Name 'Em All (name-em-all)

One continuous wall of every Pokémon species as a silhouette. Type a name under
a silhouette and it reveals the moment the name matches (no Enter; wrong text
has no effect). Tab jumps between unsolved boxes. Hints are free and unlimited.
Progress is saved in this browser only (localStorage). No account, no backend.

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
```

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
- **Sprites by generation** (the picture of a flipped solved card, a swipeable
  carousel): each generation's in-game sprite from PokeAPI/sprites
  (`public/sprites/<gen>/<id>.*`): Red/Blue, Crystal, Emerald, Platinum,
  Black/White (animated), X/Y, Ultra Sun/Moon, Sword/Shield (Legends: Arceus
  for Hisui), Scarlet/Violet. Gens VII–IX ship as still first frames (their
  animations run 0.2–2.6 MB each); VIII–IX are resized to 192px. Then the
  modern animated sprite (`public/anim`) when it differs from Gen V's.
- **Back sprites and menu/box icons** (downloaded, not shown yet):
  `public/sprites/back/<gen>/<id>.*` from the same games as the fronts and in
  the same formats (Gens I–II cut from their white backgrounds), and
  `public/icons/<gen>/<id>.*` for Gens III–IX (Gen IX's as WebP). Each species
  lists the generations it has as `backSprites` and `icons` in `pokedex.json`;
  paths come from `src/lib/sprites.ts`.
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

Key `wtp-ultimate:progress`:

```json
{ "version": 1, "pokemon": { "25": { "solved": true, "artwork": false, "types": 1, "letters": 3 } } }
```

Keys are National Dex numbers. Malformed values are dropped or clamped.
Unreadable or unknown-version saves are copied to `wtp-ultimate:progress:unreadable-backup`
before the app starts fresh. If storage is unavailable, the game runs in memory and says so in the header.
