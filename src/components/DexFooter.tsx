import { useEffect, useState, type ReactNode } from "react";
import { groupDexEntries, loadDexEntries, type DexEntry } from "../lib/dexEntries";
import { romanGeneration } from "../lib/generations";

const BASE = import.meta.env.BASE_URL;

interface Props {
  id: number;
  name: string;
  flipped: boolean;
  children: ReactNode; // the front: name and types
}

type Entries = { state: "loading" } | { state: "error" } | { state: "ready"; entries: DexEntry[] };

// A solved tile's footer. Its front (name and types) sets the height; when the
// card flips it turns over, in step with the picture, to a scrollable list of
// the species' Pokédex entries grouped by generation. Entries download the
// first time the card is flipped.
export function DexFooter({ id, name, flipped, children }: Props) {
  const [entries, setEntries] = useState<Entries>();

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

  return (
    <div className={`foot flip${flipped ? " flipped" : ""}`}>
      <div className="flip-inner">
        <div className="foot-front" inert={flipped}>
          {children}
        </div>
        <div
          className="flip-face flip-back dex-entries"
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
  );
}
