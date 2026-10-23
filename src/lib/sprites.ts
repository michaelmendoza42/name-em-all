import type { Species } from "./dataset";
import { romanGeneration } from "./generations";

// File extension of public/sprites/<gen>/<id>.* per generation; must match
// GEN_SPRITES in scripts/build-data.mjs. Gen V's animate; VII–IX are still
// frames, VIII and IX of larger 3D renders.
const EXT: Record<number, string> = { 5: "gif", 8: "webp", 9: "webp" };

export interface SpriteSlide {
  key: string;
  label: string; // "Gen I", or "Animated" for the modern animated sprite
  path: string; // relative to the app's base URL
  pixelArt: boolean; // render with hard pixel edges
}

// The slides on a flipped card: the species' sprite from each generation's
// games, oldest first, then its modern animated sprite when it has one.
export function spriteSlides(species: Pick<Species, "id" | "sprites" | "animated">): SpriteSlide[] {
  const slides: SpriteSlide[] = (species.sprites ?? []).map((gen) => ({
    key: `gen-${gen}`,
    label: `Gen ${romanGeneration(gen)}`,
    path: `sprites/${gen}/${species.id}.${EXT[gen] ?? "png"}`,
    pixelArt: gen <= 7,
  }));
  if (species.animated) {
    slides.push({ key: "anim", label: "Animated", path: `anim/${species.id}.gif`, pixelArt: true });
  }
  return slides;
}
