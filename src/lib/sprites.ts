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
  path: string; // relative to the app's base URL
  pixelArt: boolean; // render with hard pixel edges
}

// The slides on a flipped card: the species' sprite from each generation's
// games, oldest first, then its modern animated sprite when it has one.
export function spriteSlides(species: Pick<Species, "id" | "sprites" | "animated">): SpriteSlide[] {
  const slides: SpriteSlide[] = (species.sprites ?? []).map((gen) => ({
    key: `gen-${gen}`,
    generation: gen,
    label: `Gen ${romanGeneration(gen)}`,
    path: frontSpritePath(gen, species.id),
    pixelArt: gen <= 7,
  }));
  if (species.animated) {
    slides.push({ key: "anim", label: "Animated", path: `anim/${species.id}.gif`, pixelArt: true });
  }
  return slides;
}

// The slide a card opens on: the latest generation's sprite.
export function defaultSlide(slides: readonly SpriteSlide[]): number {
  return Math.max(0, slides.findLastIndex((s) => s.generation !== undefined));
}
