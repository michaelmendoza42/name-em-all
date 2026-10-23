import { useRef } from "react";
import "./flip.css";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  animated: boolean;
  flipped: boolean;
  onFlip: () => void;
}

// A solved tile's image, and the button that flips the card. Flipped, the
// picture turns over to the animated sprite (when the species has one) while
// the footer below turns over to the Pokédex entries (DexFooter). The sprite
// only downloads the first time the card is flipped.
export function FlipArt({ id, name, animated, flipped, onFlip }: Props) {
  // Keep the sprite once loaded, so it's still there while flipping back.
  const seen = useRef(false);
  seen.current ||= flipped;

  const artwork = (
    <img
      src={`${BASE}art/${id}.webp`}
      alt={name}
      width={256}
      height={256}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );

  return (
    <button
      type="button"
      className={`art flip${animated ? " animated" : ""}${flipped ? " flipped" : ""}`}
      aria-pressed={flipped}
      aria-label={`Flip card to see ${name}'s Pokédex entries`}
      onClick={onFlip}
    >
      <span className="flip-inner">
        <span className="flip-face flip-front">{artwork}</span>
        {animated && (
          <span className="flip-face flip-back">
            {seen.current && <img src={`${BASE}anim/${id}.gif`} alt={`${name}, animated`} draggable={false} />}
          </span>
        )}
      </span>
    </button>
  );
}
