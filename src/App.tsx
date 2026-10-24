import {
  type CSSProperties,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { buildAnswerIndex, type AnswerIndex } from "./lib/answers";
import { loadDataset, type Dataset } from "./lib/dataset";
import { groupByGeneration, romanGeneration, type GenerationGroup } from "./lib/generations";
import { isCollapsed, setCollapsed as saveCollapsed } from "./lib/collapsed";
import { getIconStyle, setIconStyle as saveIconStyle, unlockedIconStyles } from "./lib/iconStyle";
import { STORAGE_KEY, type ProgressStore } from "./lib/progress";
import { focusAndGlide, isGliding } from "./lib/scroll";
import { iconGenerations } from "./lib/sprites";
import { DevTools } from "./components/DevTools";
import { IconStylePicker } from "./components/IconStylePicker";
import { LevelUp } from "./components/LevelUp";
import { guessInputs, Tile } from "./components/Tile";

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
        <Menu store={store} data={load.state === "ready" ? load.data : undefined} />
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
      {load.state === "ready" && <JumpToNext />}

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
  // Completed generations, as a string so the snapshot is stable between changes.
  const completed = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () =>
      groups
        .filter((g) => store.solvedCount(g.species.map((s) => s.id)) === g.species.length)
        .map((g) => g.generation)
        .join(),
  );
  const iconStyles = useMemo(
    () =>
      unlockedIconStyles(
        completed ? completed.split(",").map(Number) : [],
        groups.map((g) => g.generation),
      ),
    [completed, groups],
  );
  return (
    <div key={epoch}>
      {groups.map((g) => (
        <GenerationSection key={g.generation} group={g} store={store} answers={answers} iconStyles={iconStyles} />
      ))}
    </div>
  );
}

export function GenerationSection({
  group,
  store,
  answers,
  iconStyles,
}: {
  group: GenerationGroup;
  store: ProgressStore;
  answers: AnswerIndex;
  iconStyles: readonly number[]; // unlocked icon styles, by generation
}) {
  const ids = useMemo(() => group.species.map((s) => s.id), [group]);
  const solved = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.solvedCount(ids),
  );
  const headingId = `gen-${group.generation}`;
  const wallId = `${headingId}-wall`;
  const complete = ids.length > 0 && solved === ids.length;
  const [collapsed, setCollapsed] = useState(() => isCollapsed(group.generation));
  const sectionRef = useRef<HTMLElement>(null);
  const toggled = useRef(false);
  // A completed generation's cards can swap their artwork for any unlocked
  // icon style its species appear in.
  const iconGens = useMemo(
    () => iconGenerations(group.species).filter((g) => iconStyles.includes(g)),
    [group, iconStyles],
  );
  const [iconStyle, setIconStyle] = useState(() => getIconStyle(group.generation));
  const iconGen = complete && iconStyle !== undefined && iconGens.includes(iconStyle) ? iconStyle : undefined;
  // Wiggle the picker when it gains a style during this visit (not on load).
  const offered = complete ? iconGens.length : 0;
  const lastOffered = useRef(offered);
  const [jiggle, setJiggle] = useState(false);
  useEffect(() => {
    if (offered > lastOffered.current) setJiggle(true);
    lastOffered.current = offered;
  }, [offered]);
  // Level up when the last Pokémon is named during this visit (not on load).
  const wasComplete = useRef(complete);
  const [leveling, setLeveling] = useState(false);
  useEffect(() => {
    if (complete && !wasComplete.current) setLeveling(true);
    if (!complete) setLeveling(false);
    wasComplete.current = complete;
  }, [complete]);

  // Collapsing from partway down a long section would leave the view far
  // below its header; pull the header back up under the top bar. Skipped for
  // sections restored collapsed on load, which the user didn't just toggle.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!collapsed || !section || !toggled.current) return;
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 0;
    const top = section.getBoundingClientRect().top;
    if (top < barH) window.scrollBy(0, top - barH);
  }, [collapsed]);

  return (
    <section className="generation" aria-labelledby={headingId} ref={sectionRef}>
      <header className={complete ? "generation-head complete" : "generation-head"}>
        {/* The header is a Gen 3 EXP bar: it fills as the generation is named. */}
        <div
          className={leveling ? "exp-bar leveling" : "exp-bar"}
          style={{ "--fill": `${ids.length ? (solved / ids.length) * 100 : 0}%` } as CSSProperties}
        >
          <h2 id={headingId}>
            {/* Covers the whole bar (see CSS), so the header toggles anywhere. */}
            <button
              type="button"
              className="collapse-toggle"
              aria-expanded={!collapsed}
              aria-controls={wallId}
              onClick={() => {
                toggled.current = true;
                saveCollapsed(group.generation, !collapsed);
                setCollapsed(!collapsed);
              }}
            >
              <span className="chevron" aria-hidden="true" />
              {/* "Generation" shortens to "Gen" on narrow screens (see CSS). */}
              <span>
                <span className="gen-long">Generation</span>
                <span className="gen-short">Gen</span> {romanGeneration(group.generation)}
                {group.region && <span className="region"> · {group.region}</span>}
              </span>
            </button>
          </h2>
          <div className="generation-meta">
            <p className="generation-count">
              {complete && <span aria-hidden="true">✓ </span>}
              {fmt.format(solved)} / {fmt.format(ids.length)}
            </p>
            {complete && iconGens.length > 0 && (
              <IconStylePicker
                title={group.title}
                choices={iconGens}
                value={iconGen}
                onChange={(next) => {
                  saveIconStyle(group.generation, next);
                  setIconStyle(next);
                }}
                sample={group.species[0]}
                unlocked={iconStyles}
                jiggle={jiggle}
              />
            )}
          </div>
        </div>
        {leveling && (
          <LevelUp name={group.region ?? group.title} count={ids.length} onDone={() => setLeveling(false)} />
        )}
      </header>
      <ol className="wall" id={wallId} start={ids[0]} hidden={collapsed}>
        {group.species.map((s) => (
          <Tile key={s.id} species={s} store={store} answers={answers} iconGen={iconGen} iconStyles={iconStyles} />
        ))}
      </ol>
    </section>
  );
}

const JUMP_IDLE_MS = 3000;

// The next unsolved name input: after the focused one, else the first one at
// or below the top of the view. Wraps to the start of the Pokédex.
function nextUnsolved(): HTMLInputElement | undefined {
  const inputs = guessInputs();
  const active = inputs.indexOf(document.activeElement as HTMLInputElement);
  if (active >= 0) return inputs[active + 1] ?? (active > 0 ? inputs[0] : undefined);
  const padTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  return inputs.find((el) => (el.closest("li") ?? el).getBoundingClientRect().top >= padTop) ?? inputs[0];
}

// Floating "next unsolved" button. It fades in while the page scrolls and
// fades out 3s after scrolling stops, or at once when a name input gains
// focus or a tile is clicked, whichever comes first.
export function JumpToNext() {
  const [shown, setShown] = useState(false);
  const timer = useRef(0);
  const hovered = useRef(false);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setShown(false);
  }, []);
  const hideLater = useCallback(() => {
    clearTimeout(timer.current);
    if (!hovered.current) timer.current = window.setTimeout(hide, JUMP_IDLE_MS);
  }, [hide]);

  useEffect(() => {
    // Focusing an input scrolls it into view; that scroll shouldn't bring the
    // button straight back.
    let quietUntil = 0;
    const onScroll = () => {
      if (isGliding() || performance.now() < quietUntil) return;
      if (!document.querySelector("input[data-guess]")) return hide();
      setShown(true);
      hideLater();
    };
    const dismiss = () => {
      quietUntil = performance.now() + 300;
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement) dismiss();
    };
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.(".tile")) dismiss();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [hide, hideLater]);

  return (
    <button
      type="button"
      className={shown ? "jump shown" : "jump"}
      onClick={() => {
        const next = nextUnsolved();
        if (next) focusAndGlide(next);
      }}
      // Hold off the fade while the pointer is on the button.
      onPointerEnter={() => {
        hovered.current = true;
        clearTimeout(timer.current);
      }}
      onPointerLeave={() => {
        hovered.current = false;
        hideLater();
      }}
    >
      Next unsolved <span aria-hidden="true">↓</span>
    </button>
  );
}

// National Dex numbers of the original 151 (Bulbasaur through Mew).
const KANTO_IDS = Array.from({ length: 151 }, (_, i) => i + 1);

type Confirming = null | "reset" | "oath";

// Rarely needed actions live behind a "⋯" menu so Reset isn't one click away.
export function Menu({ store, data }: { store: ProgressStore; data?: Dataset }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const oathRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Once all 151 are in (sworn or earned), the oath has nothing left to do.
  const kantoDone = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => store.solvedCount(KANTO_IDS) === KANTO_IDS.length,
  );

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
              <button
                type="button"
                className={kantoDone ? "menu-item done" : "menu-item"}
                onClick={() => setConfirming("oath")}
                autoFocus
              >
                {kantoDone ? "Original 151: sworn & notarized ✓" : "Fill in the original 151…"}
              </button>
              <button type="button" className="menu-item" onClick={() => setConfirming("reset")}>
                Reset progress…
              </button>
              {import.meta.env.DEV && data && <DevTools store={store} data={data} />}
            </>
          )}
        </div>
      )}
      {open && confirming === "oath" && (
        <KantoOath
          ref={oathRef}
          executed={kantoDone}
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
  executed,
  onCancel,
  onSwear,
}: {
  ref: Ref<HTMLDivElement>;
  // Already sworn (or all 151 earned): show the terms read-only, for posterity.
  executed: boolean;
  onCancel: () => void;
  onSwear: () => void;
}) {
  const [sworn, setSworn] = useState(executed);
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
              part that goes "Electrode, Diglett, Nidoran, Mankey!"
            </li>
            <li>
              <strong>Spelling Warranty.</strong> You warrant that You know Farfetch'd has an apostrophe and
              Mr. Mime has a period, and that You have never once spelled it "Pikachew."
            </li>
            <li>
              <strong>Waiver of Glory.</strong> You waive the right to feel accomplished about Generation I.
              The counter will go up anyway.
            </li>
          </ol>
        </div>
        <label className="oath-swear">
          <input
            type="checkbox"
            checked={sworn}
            disabled={executed}
            onChange={(e) => setSworn(e.target.checked)}
            autoFocus={!executed}
          />
          <span>
            I do solemnly swear that I know the original 151, because I am a millennial or close enough.
          </span>
        </label>
        {executed ? (
          <div className="confirm-actions">
            <p className="oath-executed">Executed. No take-backs.</p>
            <button type="button" onClick={onCancel} autoFocus>
              Close
            </button>
          </div>
        ) : (
          <div className="confirm-actions">
            <button type="button" onClick={onCancel}>
              I decline (respectfully)
            </button>
            <button type="button" className="primary" disabled={!sworn} onClick={onSwear}>
              Swear &amp; fill in 151
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
