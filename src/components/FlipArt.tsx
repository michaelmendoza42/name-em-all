import { useState } from "react";
import "./flip.css";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  animated: boolean;
}

// A solved tile's image. When the species has an animated sprite, clicking
// (or Enter/Space) flips the card over to show it; clicking again flips back.
// The sprite only downloads the first time the card is flipped.
export function FlipArt({ id, name, animated }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  if (!animated) return <div className="art">{artwork}</div>;

  return (
    <button
      type="button"
      className={`art flip${flipped ? " flipped" : ""}`}
      aria-pressed={flipped}
      aria-label={`Flip card to see ${name} animated`}
      onClick={() => {
        setLoaded(true);
        setFlipped((f) => !f);
      }}
    >
      <span className="flip-inner">
        <span className="flip-face flip-front">{artwork}</span>
        <span className="flip-face flip-back">
          {loaded && <img src={`${BASE}anim/${id}.gif`} alt={`${name}, animated`} draggable={false} />}
        </span>
      </span>
    </button>
  );
}
