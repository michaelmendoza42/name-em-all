import type { Species } from "./dataset";
import { romanGeneration } from "./generations";

// File extension of public/sprites/<gen>/<id>.* per generation; must match
// GEN_SPRITES in scripts/build-data.mjs. Gen V's animate; VII–IX are still
// frames, VIII and IX of larger 3D renders.
const EXT: Record<number, string> = { 5: "gif", 8: "webp", 9: "webp" };
// Menu / box icons are PNG, except Gen IX's (re-encoded from large PNGs).
const ICON_EXT: Record<number, string> = { 9: "webp" };

// Paths, relative to the app's base URL, for generations listed in a
// species' sprites / backSprites / icons. Back sprites share the front's formats.
export const frontSpritePath = (gen: number, id: number) => `sprites/${gen}/${id}.${EXT[gen] ?? "png"}`;
export const backSpritePath = (gen: number, id: number) => `sprites/back/${gen}/${id}.${EXT[gen] ?? "png"}`;
export const iconPath = (gen: number, id: number) => `icons/${gen}/${id}.${ICON_EXT[gen] ?? "png"}`;

export interface SpriteSlide {
  key: string;
  label: string; // "Gen I", "Gen VI/VII", or "Animated" for a later species' animated sprite
  generation?: number; // the first generation shown; undefined for "Animated"
  path: string; // front sprite, relative to the app's base URL
  back?: { path: string; scale: number }; // back sprite, for a battle scene
  pixelArt: boolean; // render with hard pixel edges
}

// Gen I stored back sprites at 32px and the games drew them doubled.
const BACK_SCALE: Record<number, number> = { 1: 2 };

// Showdown's animated sprites are the 3D models Gens VI–VII's games share
// (their stills are mostly identical), so for species from those games the
// animation stands in for both generations' stills on one slide.
const ANIMATED_GENS = [6, 7];

// The slides on a flipped card: the species' sprites from each generation's
// games, oldest first, front and back together as a battle scene. A species
// from Gen VII or earlier shows its animated sprite as one "Gen VI/VII" slide
// in place of those stills; a later one shows it last, as "Animated".
export function spriteSlides(
  species: Pick<Species, "id" | "generation" | "sprites" | "backSprites" | "animated" | "animatedBack">,
): SpriteSlide[] {
  const animGens = species.animated ? ANIMATED_GENS.filter((g) => g >= species.generation) : [];
  const stills: SpriteSlide[] = (species.sprites ?? [])
    .filter((gen) => !animGens.includes(gen))
    .map((gen) => ({
      key: `gen-${gen}`,
      generation: gen,
      label: `Gen ${romanGeneration(gen)}`,
      path: frontSpritePath(gen, species.id),
      back: species.backSprites?.includes(gen)
        ? { path: backSpritePath(gen, species.id), scale: BACK_SCALE[gen] ?? 1 }
        : undefined,
      pixelArt: gen <= 7,
    }));
  if (!species.animated) return stills;
  const animated: SpriteSlide = {
    key: "anim",
    generation: animGens[0],
    label: animGens.length ? `Gen ${animGens.map(romanGeneration).join("/")}` : "Animated",
    path: `anim/${species.id}.gif`,
    back: species.animatedBack ? { path: `anim/back/${species.id}.gif`, scale: 1 } : undefined,
    pixelArt: true,
  };
  if (!animGens.length) return [...stills, animated];
  const at = stills.findIndex((s) => s.generation! > animGens[0]);
  return at < 0 ? [...stills, animated] : [...stills.slice(0, at), animated, ...stills.slice(at)];
}


// Every generation whose menu icons cover at least one of these species,
// oldest first. Gens I–II's are the shared party shapes of Red/Blue and Crystal.
export function iconGenerations(species: readonly Pick<Species, "icons">[]): number[] {
  return [...new Set(species.flatMap((s) => s.icons ?? []))].sort((a, b) => a - b);
}

// The species' icon closest to the chosen generation's style: that one, else
// its latest icon before it, else its earliest after it. Undefined when the
export interface FrontIcon {
  path: string;
  pixelArt: boolean;
}

// The species' icon closest to the chosen generation's style: that one, else
// its latest icon before it, else its earliest after it. Undefined when the
// species has no icons at all. Icons are pixel art up to Gen VIII.
export function iconFor(species: Pick<Species, "id" | "icons">, generation: number): FrontIcon | undefined {
  const gens = species.icons ?? [];
  const gen = gens.includes(generation)
    ? generation
    : (gens.filter((g) => g < generation).at(-1) ?? gens.find((g) => g > generation));
  return gen === undefined ? undefined : { path: iconPath(gen, species.id), pixelArt: gen <= 8 };
}
