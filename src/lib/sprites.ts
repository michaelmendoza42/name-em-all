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
  label: string; // "Gen I", or "Animated" for the modern animated sprite
  generation?: number; // undefined for the modern animated sprite
  path: string; // front sprite, relative to the app's base URL
  back?: { path: string; scale: number }; // back sprite, for a battle scene
  pixelArt: boolean; // render with hard pixel edges
}

// Gen I stored back sprites at 32px and the games drew them doubled.
const BACK_SCALE: Record<number, number> = { 1: 2 };

// The slides on a flipped card: the species' modern animated sprite (front
// only) when it has one, then its sprites from each generation's games, oldest
// first, front and back together as a battle scene.
export function spriteSlides(species: Pick<Species, "id" | "sprites" | "backSprites" | "animated">): SpriteSlide[] {
  const slides: SpriteSlide[] = species.animated
    ? [{ key: "anim", label: "Animated", path: `anim/${species.id}.gif`, pixelArt: true }]
    : [];
  for (const gen of species.sprites ?? []) slides.push({
    key: `gen-${gen}`,
    generation: gen,
    label: `Gen ${romanGeneration(gen)}`,
    path: frontSpritePath(gen, species.id),
    back: species.backSprites?.includes(gen)
      ? { path: backSpritePath(gen, species.id), scale: BACK_SCALE[gen] ?? 1 }
      : undefined,
    pixelArt: gen <= 7,
  });
  return slides;
}

// The slide a card opens on: the latest generation's sprite.
export function defaultSlide(slides: readonly SpriteSlide[]): number {
  return Math.max(0, slides.findLastIndex((s) => s.generation !== undefined));
}
