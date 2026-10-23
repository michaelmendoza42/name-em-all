import { useEffect, useRef, useState, type MouseEvent } from "react";
import { groupDexEntries, loadDexEntries, type DexEntry } from "../lib/dexEntries";
import { romanGeneration } from "../lib/generations";
import "./flip.css";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  animated: boolean;
}

type Entries = { state: "loading" } | { state: "error" } | { state: "ready"; entries: DexEntry[] };

// A solved tile's image. Clicking it (or Enter/Space) flips the card over to
// show the animated sprite (or the artwork, small, when there is none) above
// a scrollable list of the species' Pokédex entries from every generation.
// Clicking the sprite flips it back. The sprite and entries only download the
// first time the card is flipped.
export function FlipArt({ id, name, animated }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [entries, setEntries] = useState<Entries>();
  const frontRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const entriesRef = useRef<HTMLDivElement>(null);
  const toggled = useRef(false);

  function load() {
    setEntries({ state: "loading" });
    loadDexEntries(`${BASE}dex/${id}.json`).then(
      (list) => setEntries({ state: "ready", entries: list }),
      () => setEntries({ state: "error" }),
    );
  }

  function flip() {
    if (!flipped && entries?.state !== "ready" && entries?.state !== "loading") load();
    toggled.current = true;
    setFlipped((f) => !f);
  }

  // The face turned away is inert, so keep keyboard focus on the visible one.
  useEffect(() => {
    if (!toggled.current) return;
    (flipped ? backRef : frontRef).current?.focus({ preventScroll: true });
  }, [flipped]);

  // Clicking the back flips it, except inside the entries, so scrolling,
  // dragging the scrollbar or selecting text never flips the card by accident.
  function onBackClick(e: MouseEvent) {
    if (!entriesRef.current?.contains(e.target as Node)) flip();
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

  return (
    <div className={`art flip${flipped ? " flipped" : ""}`}>
      <div className="flip-inner">
        <button
          type="button"
          ref={frontRef}
          className="flip-face flip-front"
          aria-label={`Flip card to see ${name}'s Pokédex entries`}
          inert={flipped}
          onClick={flip}
        >
          {artwork}
        </button>
        <div className="flip-face flip-back" inert={!flipped} onClick={onBackClick}>
          <button type="button" ref={backRef} className="flip-sprite" aria-label={`Flip ${name}'s card back`}>
            {entries &&
              (animated ? (
                <img src={`${BASE}anim/${id}.gif`} alt={`${name}, animated`} draggable={false} />
              ) : (
                <img className="still" src={`${BASE}art/${id}.webp`} alt="" draggable={false} />
              ))}
          </button>
          <div
            className="dex-entries"
            ref={entriesRef}
            role="region"
            aria-label={`${name}'s Pokédex entries`}
            tabIndex={0}
          >
            {entries?.state === "loading" && <p className="dex-status">Loading…</p>}
            {entries?.state === "error" && (
              <p className="dex-status">
                Couldn't load entries.{" "}
                <button type="button" className="dex-retry" onClick={load}>
                  Retry
                </button>
              </p>
            )}
            {entries?.state === "ready" &&
              groupDexEntries(entries.entries).map((g) => (
                <section key={g.generation} className="dex-gen">
                  <h3>Gen {romanGeneration(g.generation)}</h3>
                  {g.entries.map((e) => (
                    <p key={e.versions.join()}>
                      <span className="dex-games">{e.versions.join(" · ")}</span> {e.text}
                    </p>
                  ))}
                </section>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
