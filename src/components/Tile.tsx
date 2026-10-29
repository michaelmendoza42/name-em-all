import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import type { Species } from "../lib/dataset";
import { normalizeAnswer, type AnswerIndex } from "../lib/answers";
import { gradeGuess, revealableCount, revealedPrefix, type GradeState } from "../lib/hints";
import type { ProgressStore } from "../lib/progress";
import { focusAndGlide } from "../lib/scroll";
import { iconFor, spriteSlides } from "../lib/sprites";
import { DexFooter } from "./DexFooter";
import { FlipArt } from "./FlipArt";
import { HintMenu, type HintOption } from "./HintMenu";

const BASE = import.meta.env.BASE_URL;

interface Props {
  species: Species;
  store: ProgressStore;
  answers: AnswerIndex;
  // Menu-icon generation to show on the solved front instead of the artwork,
  // and the unlocked generations its fallbacks may use.
  iconGen?: number;
  iconStyles?: readonly number[];
  // Hide the dex number until solved (it would give the answer away in hard mode).
  anonymous?: boolean;
  // No hint menu (hard mode).
  noHints?: boolean;
}

function useProgress(store: ProgressStore, id: number) {
  const subscribe = useCallback((l: () => void) => store.subscribe(id, l), [store, id]);
  return useSyncExternalStore(subscribe, () => store.get(id));
}

// Every unsolved tile's name input in page order, skipping collapsed generations.
export function guessInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input[data-guess]")).filter(
    (el) => !el.closest("[hidden]"),
  );
}

// The next (or previous) unsolved tile's name input, so solving can continue
// by keyboard. Look it up before solving: the solved tile's input unmounts.
function adjacentGuess(from: HTMLInputElement, dir: 1 | -1): HTMLInputElement | undefined {
  const inputs = guessInputs();
  return inputs[inputs.indexOf(from) + dir];
}

// True when `input` is the last unsolved name in its generation, so solving
// it completes the generation. Looks across the page, since Hard Mode's wall
// mixes generations.
function finishesGeneration(input: HTMLInputElement): boolean {
  const gen = input.closest<HTMLElement>("[data-gen]")?.dataset.gen;
  return document.querySelectorAll(`[data-gen="${gen}"] input[data-guess]`).length === 1;
}

// Drop the start of `typed` that spells `added` (newly locked letters), so
// revealing a letter you already typed doesn't double it.
function stripTyped(typed: string, added: string): string {
  const target = normalizeAnswer(added);
  if (!target || !normalizeAnswer(typed).startsWith(target)) return typed;
  for (let i = 1; i <= typed.length; i++) {
    if (normalizeAnswer(typed.slice(0, i)) === target) return typed.slice(i).trimStart();
  }
  return typed;
}

export const Tile = memo(function Tile({ species, store, answers, iconGen, iconStyles, anonymous, noHints }: Props) {
  const { id, name, types } = species;
  const progress = useProgress(store, id);
  // Whatever was left typed survives a reload (see ProgressStore drafts).
  const [guess, setGuess] = useState(() => (store.get(id).solved ? "" : store.draft(id)));
  const [justSolved, setJustSolved] = useState(false);
  // Set when a solve should keep focus on this tile instead of advancing.
  const [holdFocus, setHoldFocus] = useState(false);
  // Solved cards flip: sprite in the picture, Pokédex entries in the footer.
  const [flipped, setFlipped] = useState(false);
  const slides = useMemo(() => spriteSlides(species), [species]);
  const [slide, setSlide] = useState(0);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const tileRef = useRef<HTMLLIElement>(null);
  const hintToggleRef = useRef<HTMLButtonElement>(null);
  // The Hint button only shows on the card you're on: hovered, focused, or
  // tapped (touch has no hover, so a tap "engages" the card until you tap away).
  const [engaged, setEngaged] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const number = `#${String(id).padStart(4, "0")}`;
  const hideNumber = anonymous && !progress.solved;
  const label = hideNumber ? "this mystery Pokémon" : `Pokémon ${number}`;
  const letterTotal = useMemo(() => revealableCount(name), [name]);

  const showArt = progress.solved || progress.artwork;
  const allLetters = progress.letters >= letterTotal;
  // Revealed letters sit locked at the start of the input; the user types the rest.
  const prefix = progress.solved ? "" : revealedPrefix(name, progress.letters);
  const canCheck = normalizeAnswer(guess) !== "";
  // Once Spellcheck is on, the guess is regraded live as it's typed. Only
  // typed letters get colors; they're graded in place after any letters the
  // Letter hint locked in, which stay plain.
  const spellcheck = progress.spellcheck === true && !progress.solved;
  const marks: Mark[] = useMemo(
    () => (spellcheck ? gradeGuess(name, prefix + guess).slice(Array.from(prefix).length) : []),
    [spellcheck, name, prefix, guess],
  );
  const tinted = marks.some((m) => m.state !== "plain");
  const mirrorRef = useRef<HTMLSpanElement>(null);
  // The colored copy sits under the input's (then invisible) text; keep it
  // aligned when a long guess scrolls sideways.
  const syncMirror = () => {
    if (mirrorRef.current && inputRef.current)
      mirrorRef.current.style.transform = `translateX(${-inputRef.current.scrollLeft}px)`;
  };
  useEffect(syncMirror);

  useEffect(() => store.setDraft(id, progress.solved ? "" : guess), [store, id, guess, progress.solved]);

  useEffect(() => {
    if (holdFocus && progress.solved) nameRef.current?.focus();
  }, [holdFocus, progress.solved]);

  const prevPrefix = useRef(prefix);
  useEffect(() => {
    const added = prefix.startsWith(prevPrefix.current) ? prefix.slice(prevPrefix.current.length) : "";
    prevPrefix.current = prefix;
    if (added) setGuess((g) => stripTyped(g, added));
  }, [prefix]);

  // Solves if the locked prefix plus the typed text (or the typed text on its
  // own) is a correct answer. Anything else has no effect at all.
  function trySolve(typed: string, input: HTMLInputElement) {
    const full = [prefix + typed, typed].find((g) => g.trim() && answers.isCorrect(id, g));
    if (full === undefined) return;
    // A longer accepted answer may still be on its way ("Nidoran F" while
    // typing "Nidoran Female"); keep focus here so the rest of it doesn't
    // land in the next tile. Finishing a generation also stays put, so its
    // level-up plays out before the next generation's cards.
    const next =
      answers.isExtendable(id, full) || finishesGeneration(input) ? undefined : adjacentGuess(input, 1);
    setJustSolved(true);
    store.solve(id);
    if (next) focusAndGlide(next);
    else setHoldFocus(true);
  }

  // Sporcle-style: the tile solves the moment the text matches.
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setGuess(e.target.value);
    trySolve(e.target.value, e.target);
  }

  // Tab / Shift+Tab jump straight to the next / previous unsolved name input,
  // skipping hint buttons. ArrowDown reaches this tile's Hint button.
  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Only needed once every letter is locked in and nothing is left to type.
      e.preventDefault();
      trySolve(guess, e.currentTarget);
    } else if (e.key === "Tab") {
      const target = adjacentGuess(e.currentTarget, e.shiftKey ? -1 : 1);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    } else if (e.key === "ArrowDown") {
      // The Hint circle, or the first hint once it has spread into a row.
      const target =
        hintToggleRef.current ??
        e.currentTarget.closest(".answer")?.querySelector<HTMLButtonElement>(".hints button:not(:disabled)");
      if (target && !target.disabled) {
        e.preventDefault();
        target.focus();
      }
    }
  }

  // A tap or click elsewhere on the page disengages the card and closes its hints.
  useEffect(() => {
    if (!engaged && !hintsOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (tileRef.current?.contains(e.target as Node)) return;
      setEngaged(false);
      setHintsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [engaged, hintsOpen]);

  const hintOptions: HintOption[] = [
    {
      key: "artwork",
      text: "Artwork",
      done: progress.artwork,
      label: progress.artwork ? `Artwork revealed for ${label}` : `Reveal artwork for ${label}`,
      title: progress.artwork ? "Artwork revealed" : "Reveal the artwork",
      onReveal: () => store.revealArtwork(id),
    },
    {
      key: "letter",
      text: "Letter",
      done: allLetters,
      label: allLetters ? `All letters revealed for ${label}` : `Reveal Letter for ${label}`,
      title: allLetters ? "All letters revealed" : "Reveal the next letter",
      onReveal: () => {
        store.revealLetter(id, letterTotal);
        // The last letter spells the whole name, so there's nothing left to submit.
        if (store.get(id).letters >= letterTotal) {
          setJustSolved(true);
          setHoldFocus(true);
          store.solve(id);
        }
      },
    },
  ];
  // Spellcheck only appears once there's a guess to grade, and stays (spent)
  // once it's on.
  if (canCheck || spellcheck) {
    hintOptions.push({
      key: "spellcheck",
      text: "Spellcheck",
      done: spellcheck,
      label: spellcheck ? `Spellcheck is on for ${label}` : `Check your spelling letter by letter for ${label}`,
      title: spellcheck ? "Spellcheck is on" : "Check your spelling letter by letter, as you type",
      onReveal: () => {
        store.spellcheck(id);
        // Fold the row away so the result shows and typing carries on at the end.
        setHintsOpen(false);
        const input = inputRef.current;
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      },
    });
  }

  return (
    <li
      ref={tileRef}
      data-gen={species.generation}
      className={`tile${progress.solved ? " solved" : ""}${justSolved ? " just-solved" : ""}${engaged || hintsOpen ? " engaged" : ""}`}
      onPointerDown={progress.solved ? undefined : () => setEngaged(true)}
      onBlur={(e) => {
        // Focus moving to another card closes this one's hints.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setHintsOpen(false);
      }}
    >
      {!hideNumber && <span className="dex">{number}</span>}
      {progress.solved ? (
        <FlipArt
          id={id}
          name={name}
          icon={iconGen === undefined ? undefined : iconFor(species, iconGen, iconStyles)}
          slides={slides}
          index={slide}
          onIndex={setSlide}
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
        />
      ) : (
        <div className="art">
          <img
            src={`${BASE}${showArt ? "art" : "sil"}/${id}.webp`}
            alt={showArt ? `Artwork of ${label}` : `Silhouette of ${label}`}
            width={256}
            height={256}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
      )}

      {/* Solved and unsolved tiles share one two-row layout so every card is
          the same height: name or input, then types or the hints button. */}
      {progress.solved ? (
        <DexFooter id={id} name={name} flipped={flipped} generation={slides[slide]?.generation}>
          <p className="name" ref={nameRef} tabIndex={-1}>
            <span className="sr-only">Solved: </span>
            {name}
          </p>
          <div className="types">
            {types.map((t) => (
              <span key={t} className={`type type-${t}`}>
                {t}
              </span>
            ))}
          </div>
        </DexFooter>
      ) : (
        <div className={`answer${hintsOpen ? " open" : ""}${noHints ? " no-hints" : ""}`}>
          {/* Clicking anywhere in the box (including the locked letters) focuses the input. */}
          <div
            className={`guess${prefix ? " has-prefix" : ""}${tinted ? " wordle" : ""}`}
            onClick={() => inputRef.current?.focus()}
          >
            <label htmlFor={inputId} className="sr-only">
              Name of {label}
            </label>
            {prefix && (
              <span className="prefix" aria-hidden="true">
                {prefix}
              </span>
            )}
            <span className="field">
              <input
                id={inputId}
                ref={inputRef}
                data-guess
                onKeyDown={onInputKeyDown}
                aria-keyshortcuts="Tab Shift+Tab ArrowDown"
                aria-describedby={
                  [prefix && `${inputId}-hint`, tinted && `${inputId}-check`].filter(Boolean).join(" ") || undefined
                }
                value={guess}
                onChange={onChange}
                placeholder={prefix ? "" : "Who's that?"}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="next"
                onScroll={syncMirror}
                onSelect={syncMirror}
              />
              {tinted && (
                <span className="mirror" aria-hidden="true">
                  <span ref={mirrorRef}>
                    <Marks marks={marks} />
                  </span>
                </span>
              )}
            </span>
            {prefix && (
              <span className="sr-only" id={`${inputId}-hint`}>
                Starts with {prefix}
              </span>
            )}
            {tinted && (
              <span className="sr-only" id={`${inputId}-check`}>
                {spokenCheck(marks)}
              </span>
            )}
          </div>
          {!noHints && (
            <HintMenu
              tileLabel={label}
              options={hintOptions}
              open={hintsOpen}
              onOpenChange={setHintsOpen}
              toggleRef={hintToggleRef}
              onExitUp={() => inputRef.current?.focus()}
            />
          )}
        </div>
      )}
    </li>
  );
});

const GRADE_WORDS = {
  hit: "right",
  near: "elsewhere",
  miss: "not in the name",
} as const;

type Mark = { char: string; state: GradeState };

function spokenCheck(marks: Mark[]): string {
  const said = marks
    .filter((m) => m.state !== "plain")
    .map((m) => `${m.char.toUpperCase()} ${GRADE_WORDS[m.state as keyof typeof GRADE_WORDS]}`);
  return `Spellcheck: ${said.join("; ")}`;
}

// Typed letters in the name box, tinted by Spellcheck.
function Marks({ marks }: { marks: Mark[] }) {
  return marks.map((m, i) =>
    m.state !== "plain" ? (
      <span key={i} className={`mark g-${m.state}`}>
        {m.char}
      </span>
    ) : (
      m.char
    ),
  );
}
