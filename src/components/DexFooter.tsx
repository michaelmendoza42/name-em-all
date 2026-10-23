import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { groupDexEntries, loadDexEntries, type DexEntry } from "../lib/dexEntries";
import { romanGeneration } from "../lib/generations";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  flipped: boolean;
  generation: number | undefined; // the sprite showing in the picture's carousel
  children: ReactNode; // the front: name and types
}

type Entries = { state: "loading" } | { state: "error" } | { state: "ready"; entries: DexEntry[] };

// A solved tile's footer. Its front (name and types) sets the height; when the
// card flips it turns over, in step with the picture, to a scrollable list of
// the species' Pokédex entries grouped by generation. Entries download the
// first time the card is flipped.
//
// The list follows the carousel one way: changing sprite scrolls it to that
// generation's entries (or the nearest earlier generation that has some).
// Scrolling the list yourself is free and never moves the carousel.
export function DexFooter({ id, name, flipped, generation, children }: Props) {
  const [entries, setEntries] = useState<Entries>();
  const regionRef = useRef<HTMLDivElement>(null);
  const groups = entries?.state === "ready" ? groupDexEntries(entries.entries) : [];
  const target =
    generation === undefined
      ? undefined
      : (groups.findLast((g) => g.generation <= generation) ?? groups[0])?.generation;

  function load() {
    setEntries({ state: "loading" });
    loadDexEntries(`${BASE}dex/${id}.json`).then(
      (list) => setEntries({ state: "ready", entries: list }),
      () => setEntries({ state: "error" }),
    );
  }

  useEffect(() => {
    if (flipped && !entries) load();
  }, [flipped]); // load() only reads id, which is fixed per tile

  // Jump straight there when the card turns over or the entries arrive, and
  // glide there when the sprite changes while the card is showing.
  const ready = entries?.state === "ready";
  const shown = useRef({ flipped, ready });
  useLayoutEffect(() => {
    const region = regionRef.current;
    const section = region?.querySelector<HTMLElement>(`[data-gen="${target}"]`);
    const instant = !shown.current.flipped || !shown.current.ready;
    shown.current = { flipped, ready };
    if (!flipped || !region || !section) return;
    region.scrollTo?.({ top: section.offsetTop, behavior: instant ? "instant" : "smooth" });
  }, [flipped, ready, target]);

  return (
    <div className={`foot flip${flipped ? " flipped" : ""}`}>
      <div className="flip-inner">
        <div className="foot-front" inert={flipped}>
          {children}
        </div>
        <div
          className="flip-face flip-back dex-entries"
          ref={regionRef}
          role="region"
          aria-label={`${name}'s Pokédex entries`}
          tabIndex={flipped ? 0 : -1}
          inert={!flipped}
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
          {groups.map((g) => (
            <section
              key={g.generation}
              className={`dex-gen${g.generation === target ? " current" : ""}`}
              data-gen={g.generation}
            >
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
  );
}
