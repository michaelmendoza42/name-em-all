import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { SpriteSlide } from "../lib/sprites";
import "./flip.css";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  slides: readonly SpriteSlide[];
  index: number; // the slide showing; kept by the tile so it survives flips
  onIndex: (index: number) => void;
  flipped: boolean;
  onFlip: () => void;
}

// A solved tile's image. Clicking it (or Enter/Space) flips the card: the
// picture turns over to a carousel of the species' sprites, one battle scene
// (front and back) per generation (opening on the one it premiered in), while the footer turns over to its
// Pokédex entries (DexFooter), which follow the sprite's generation. Swipe,
// the chevrons or ←/→ move between sprites (the chevrons and arrows wrap
// around from the last to the first and back); the card remembers which one was
// showing across flips. Sprites only download once
// the card has been flipped. With no sprites, the artwork stays put.
export function FlipArt({ id, name, slides, index, onIndex, flipped, onFlip }: Props) {
  const frontRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const toggled = useRef(false);
  const seen = useRef(false);
  seen.current ||= flipped;
  const canFlip = slides.length > 0;

  // Put the track back on the remembered slide whenever the card turns over.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (flipped && track) track.scrollLeft = index * track.clientWidth;
  }, [flipped]); // index is read, not tracked: scrolling is what updates it

  // The face turned away is inert, so keep keyboard focus on the visible one.
  useEffect(() => {
    if (!toggled.current) return;
    (flipped ? trackRef : frontRef).current?.focus({ preventScroll: true });
  }, [flipped]);

  function flip() {
    toggled.current = true;
    onFlip();
  }

  function go(to: number) {
    const track = trackRef.current;
    const i = (to + slides.length) % slides.length;
    // Wrapping jumps straight there rather than sweeping past every slide.
    const behavior = i === to ? "smooth" : "instant";
    track?.scrollTo?.({ left: i * track.clientWidth, behavior });
    onIndex(i);
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index) onIndex(i);
  }

  function onTrackKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const move = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (move) {
      e.preventDefault();
      go(index + move);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flip();
    }
  }

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

  if (!canFlip) {
    return (
      <button
        type="button"
        className="art flip"
        aria-pressed={flipped}
        aria-label={`Flip card to see ${name}'s Pokédex entries`}
        onClick={onFlip}
      >
        <span className="flip-inner">
          <span className="flip-face flip-front">{artwork}</span>
        </span>
      </button>
    );
  }

  const current = slides[Math.min(index, slides.length - 1)];
  return (
    <div className={`art flip turns${flipped ? " flipped" : ""}`}>
      <div className="flip-inner">
        <button
          type="button"
          ref={frontRef}
          className="flip-face flip-front"
          aria-label={`Flip card to see ${name}'s sprites and Pokédex entries`}
          inert={flipped}
          onClick={flip}
        >
          {artwork}
        </button>
        <div className="flip-face flip-back" inert={!flipped}>
          <div
            className="sprite-track"
            ref={trackRef}
            role="group"
            aria-roledescription="carousel"
            aria-label={`${name}'s sprites by generation. ${current.label}, ${index + 1} of ${slides.length}. Arrow keys change sprite; Enter flips back.`}
            tabIndex={0}
            onScroll={onScroll}
            onKeyDown={onTrackKeyDown}
            onClick={flip}
          >
            {slides.map((s, i) => (
              <figure
                key={s.key}
                className={`sprite-slide${s.back ? " battle" : ""}${s.pixelArt ? " pixel" : ""}`}
                aria-hidden={i !== index}
              >
                {seen.current &&
                  (s.back ? (
                    // Battle scene: the foe's front far off at top right, your
                    // own Pokémon's back up close at bottom left.
                    <>
                      <span className="foe">
                        <img
                          src={`${BASE}${s.path}`}
                          alt={`${name}, ${s.label} front sprite`}
                          loading="lazy"
                          draggable={false}
                        />
                      </span>
                      <span className="ally">
                        <img
                          src={`${BASE}${s.back.path}`}
                          alt={`${name}, ${s.label} back sprite`}
                          loading="lazy"
                          draggable={false}
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (s.back!.scale !== 1) img.style.width = `${img.naturalWidth * s.back!.scale}px`;
                          }}
                        />
                      </span>
                    </>
                  ) : (
                    <img src={`${BASE}${s.path}`} alt={`${name}, ${s.label} sprite`} loading="lazy" draggable={false} />
                  ))}
              </figure>
            ))}
          </div>
          <span className="sprite-label" aria-hidden="true">
            {current.label}
          </span>
          {slides.length > 1 && (
            <>
              <button
                type="button"
                className="sprite-nav prev"
                aria-label="Previous sprite"
                tabIndex={-1}
                onClick={() => go(index - 1)}
              >
                <Chevron d="M10 3 5 8l5 5" />
              </button>
              <button
                type="button"
                className="sprite-nav next"
                aria-label="Next sprite"
                tabIndex={-1}
                onClick={() => go(index + 1)}
              >
                <Chevron d="M6 3l5 5-5 5" />
              </button>
              <span className="sprite-dots" aria-hidden="true">
                {slides.map((s, i) => (
                  <span key={s.key} className={i === index ? "on" : undefined} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
