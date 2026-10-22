import { type CSSProperties, type Ref, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { buildAnswerIndex, type AnswerIndex } from "./lib/answers";
import { loadDataset, type Dataset } from "./lib/dataset";
import { groupByGeneration, type GenerationGroup } from "./lib/generations";
import { STORAGE_KEY, type ProgressStore } from "./lib/progress";
import { Tile } from "./components/Tile";

const DATA_URL = `${import.meta.env.BASE_URL}pokedex.json`;
const fmt = new Intl.NumberFormat("en-US");

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: Dataset };

export function App({ store }: { store: ProgressStore }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const fetchData = useCallback(() => {
    setLoad({ state: "loading" });
    loadDataset(DATA_URL).then(
      (data) => setLoad({ state: "ready", data }),
      (err: Error) => setLoad({ state: "error", message: err.message }),
    );
  }, []);

  useEffect(fetchData, [fetchData]);

  // Publish the top bar's height so generation headers stick just below it
  // (it wraps to two lines on narrow screens).
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`),
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) store.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  return (
    <>
      <header className="bar" ref={barRef}>
        <h1>Gotta Name 'Em All</h1>
        {load.state === "ready" && <Counter store={store} data={load.data} />}
        <Menu store={store} />
      </header>

      <main>
        {load.state === "loading" && <p className="status">Loading the Pokédex…</p>}
        {load.state === "error" && (
          <div className="status error" role="alert">
            <p>Couldn't load the Pokédex ({load.message}).</p>
            <button type="button" onClick={fetchData}>
              Try again
            </button>
          </div>
        )}
        {load.state === "ready" && <Wall store={store} data={load.data} />}
      </main>

      <footer className="credits">
        <p>
          Pokémon and all Pokémon artwork © Nintendo / Creatures Inc. / GAME FREAK Inc. / The Pokémon Company.
          This is an unofficial fan project and is not affiliated with or endorsed by them.
        </p>
        <p>
          Data from <a href="https://pokeapi.co">PokéAPI</a>. Progress is saved only in this browser.
        </p>
      </footer>
    </>
  );
}

function Counter({ store, data }: { store: ProgressStore; data: Dataset }) {
  const ids = useMemo(() => data.species.map((s) => s.id), [data]);
  const solved = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.solvedCount(ids),
  );
  const persistent = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.persistent,
  );
  return (
    <p className="counter" aria-live="polite">
      <strong>{fmt.format(solved)}</strong> / {fmt.format(data.count)} discovered
      {!persistent && <span className="warn"> · progress can't be saved in this browser</span>}
    </p>
  );
}

function Wall({ store, data }: { store: ProgressStore; data: Dataset }) {
  const answers = useMemo(() => buildAnswerIndex(data.species), [data]);
  const epoch = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.epoch,
  );
  const groups = useMemo(() => groupByGeneration(data.species), [data]);
  return (
    <div key={epoch}>
      {groups.map((g) => (
        <GenerationSection key={g.generation} group={g} store={store} answers={answers} />
      ))}
    </div>
  );
}

export function GenerationSection({
  group,
  store,
  answers,
}: {
  group: GenerationGroup;
  store: ProgressStore;
  answers: AnswerIndex;
}) {
  const ids = useMemo(() => group.species.map((s) => s.id), [group]);
  const solved = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.solvedCount(ids),
  );
  const headingId = `gen-${group.generation}`;
  const complete = ids.length > 0 && solved === ids.length;
  return (
    <section className="generation" aria-labelledby={headingId}>
      <header className={complete ? "generation-head complete" : "generation-head"}>
        {/* The header is a Gen 3 EXP bar: it fills as the generation is named. */}
        <div
          className="exp-bar"
          style={{ "--fill": `${ids.length ? (solved / ids.length) * 100 : 0}%` } as CSSProperties}
        >
          <span className="exp-tag" aria-hidden="true">
            EXP
          </span>
          <h2 id={headingId}>
            {group.title}
            {group.region && <span className="region"> · {group.region}</span>}
          </h2>
          <p className="generation-count">
            {complete && <span aria-hidden="true">✓ </span>}
            {fmt.format(solved)} / {fmt.format(ids.length)}
          </p>
        </div>
      </header>
      <ol className="wall" start={ids[0]}>
        {group.species.map((s) => (
          <Tile key={s.id} species={s} store={store} answers={answers} />
        ))}
      </ol>
    </section>
  );
}

// National Dex numbers of the original 151 (Bulbasaur through Mew).
const KANTO_IDS = Array.from({ length: 151 }, (_, i) => i + 1);

type Confirming = null | "reset" | "oath";

// Rarely needed actions live behind a "⋯" menu so Reset isn't one click away.
export function Menu({ store }: { store: ProgressStore }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const oathRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setConfirming(null);
    if (refocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !oathRef.current?.contains(target)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        ref={toggleRef}
        className="menu-toggle"
        aria-label="More options"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="menu-panel" id={menuId}>
          <p className="menu-note">Progress is saved in this browser only.</p>
          {confirming === "reset" ? (
            <div className="confirm" role="group" aria-label="Confirm reset">
              <p>Erase all progress? This can't be undone.</p>
              <div className="confirm-actions">
                <button type="button" onClick={() => setConfirming(null)} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    store.reset();
                    close(true);
                  }}
                >
                  Erase
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="menu-item" onClick={() => setConfirming("oath")} autoFocus>
                Fill in the original 151…
              </button>
              <button type="button" className="menu-item" onClick={() => setConfirming("reset")}>
                Reset progress…
              </button>
            </>
          )}
        </div>
      )}
      {open && confirming === "oath" && (
        <KantoOath
          ref={oathRef}
          onCancel={() => setConfirming(null)}
          onSwear={() => {
            store.solveMany(KANTO_IDS);
            close(true);
          }}
        />
      )}
    </div>
  );
}

// A deliberately over-formal "terms of service" gate for filling in Gen 1.
// Portaled to <body>: the bar's backdrop-filter would otherwise trap a fixed
// overlay inside the bar.
function KantoOath({
  ref,
  onCancel,
  onSwear,
}: {
  ref: Ref<HTMLDivElement>;
  onCancel: () => void;
  onSwear: () => void;
}) {
  const [sworn, setSworn] = useState(false);
  const titleId = useId();
  return createPortal(
    <div className="oath-backdrop" ref={ref}>
      <div className="oath" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <p className="oath-form">Form 151-A · Rev. 1998</p>
        <h2 id={titleId}>Affidavit of Original Kanto Proficiency</h2>
        <div className="oath-terms" tabIndex={0} aria-label="Terms of the affidavit">
          <p>
            PLEASE READ THESE TERMS CAREFULLY. By proceeding, the undersigned ("You," "the Trainer," or "a
            Millennial, Probably") enters into a binding agreement with Professor Oak and his successors in
            grandson.
          </p>
          <ol>
            <li>
              <strong>Declaration of Knowledge.</strong> You affirm that You could name all 151 original
              Pokémon, in Pokédex order, at a sleepover, circa 1999, while eating Dunkaroos.
            </li>
            <li>
              <strong>Common Knowledge Clause.</strong> You acknowledge that the original 151 constitute Common
              Knowledge, Duh, and that typing "Bulbasaur" by hand would be beneath You.
            </li>
            <li>
              <strong>Pokérap Provision.</strong> You can perform the Pokérap from memory, or at minimum the
              part that goes "Electrode, Diglett, Nidoran, Mankey."
            </li>
            <li>
              <strong>Spelling Warranty.</strong> You warrant that You know Farfetch'd has an apostrophe and
              Mr. Mime has a period, and that You have never once spelled it "Pikachew."
            </li>
            <li>
              <strong>MissingNo. Disclaimer.</strong> MissingNo. is not one of the 151. You agree not to bring it
              up. You know what You did to your item count.
            </li>
            <li>
              <strong>Waiver of Glory.</strong> You waive the right to feel accomplished about Generation I.
              The counter will go up anyway. The counter will know.
            </li>
            <li>
              <strong>Jurisdiction.</strong> This affidavit is binding in all regions, including the Orange
              Islands, which do so count.
            </li>
          </ol>
        </div>
        <label className="oath-swear">
          <input type="checkbox" checked={sworn} onChange={(e) => setSworn(e.target.checked)} autoFocus />
          <span>
            I do solemnly swear that I know the original 151, because I am a millennial and this is common
            knowledge, duh.
          </span>
        </label>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            I decline (respectfully)
          </button>
          <button type="button" className="primary" disabled={!sworn} onClick={onSwear}>
            Swear &amp; fill in 151
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
