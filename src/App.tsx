import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

function GenerationSection({
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
  return (
    <section className="generation" aria-labelledby={headingId}>
      <header className="generation-head">
        <h2 id={headingId}>
          {group.title}
          {group.region && <span className="region"> · {group.region}</span>}
        </h2>
        <p className="generation-count">
          {fmt.format(solved)} / {fmt.format(ids.length)}
        </p>
      </header>
      <ol className="wall" start={ids[0]}>
        {group.species.map((s) => (
          <Tile key={s.id} species={s} store={store} answers={answers} />
        ))}
      </ol>
    </section>
  );
}

// Rarely needed actions live behind a "⋯" menu so Reset isn't one click away.
export function Menu({ store }: { store: ProgressStore }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setConfirming(false);
    if (refocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
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
          {confirming ? (
            <div className="confirm" role="group" aria-label="Confirm reset">
              <p>Erase all progress? This can't be undone.</p>
              <div className="confirm-actions">
                <button type="button" onClick={() => setConfirming(false)} autoFocus>
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
            <button type="button" className="menu-item" onClick={() => setConfirming(true)} autoFocus>
              Reset progress…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
