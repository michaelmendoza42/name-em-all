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
import { remainingPattern, revealableCount, revealedPrefix, visibleTypes } from "../lib/hints";
import type { ProgressStore } from "../lib/progress";
import { focusAndGlide } from "../lib/scroll";
import { defaultSlide, spriteSlides } from "../lib/sprites";
import { DexFooter } from "./DexFooter";
import { FlipArt } from "./FlipArt";
import { HintMenu, type HintOption } from "./HintMenu";

const BASE = import.meta.env.BASE_URL;

interface Props {
  species: Species;
  store: ProgressStore;
  answers: AnswerIndex;
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

export const Tile = memo(function Tile({ species, store, answers }: Props) {
  const { id, name, types } = species;
  const progress = useProgress(store, id);
  const [guess, setGuess] = useState("");
  const [justSolved, setJustSolved] = useState(false);
  // Set when a solve should keep focus on this tile instead of advancing.
  const [holdFocus, setHoldFocus] = useState(false);
  // Solved cards flip: sprite in the picture, Pokédex entries in the footer.
  const [flipped, setFlipped] = useState(false);
  const slides = useMemo(() => spriteSlides(species), [species]);
  const [slide, setSlide] = useState(() => defaultSlide(slides));
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
  const label = `Pokémon ${number}`;
  const letterTotal = useMemo(() => revealableCount(name), [name]);

  const showArt = progress.solved || progress.artwork;
  const typesShown = visibleTypes(types, progress.types);
  const allTypes = progress.types >= types.length;
  const allLetters = progress.letters >= letterTotal;
  // Revealed letters sit locked at the start of the input; the user types the rest.
  const prefix = progress.solved ? "" : revealedPrefix(name, progress.letters);
  const remaining = progress.letters > 0 ? remainingPattern(name, progress.letters) : "";

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
    // land in the next tile.
    const next = answers.isExtendable(id, full) ? undefined : adjacentGuess(input, 1);
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
      key: "type",
      text: "Type",
      done: allTypes,
      label: allTypes ? `All types revealed for ${label}` : `Reveal Type for ${label}`,
      title: allTypes ? "All types revealed" : "Reveal a type",
      onReveal: () => store.revealType(id, types.length),
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

  return (
    <li
      ref={tileRef}
      className={`tile${progress.solved ? " solved" : ""}${justSolved ? " just-solved" : ""}${engaged || hintsOpen ? " engaged" : ""}`}
      onPointerDown={progress.solved ? undefined : () => setEngaged(true)}
      onBlur={(e) => {
        // Focus moving to another card closes this one's hints.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setHintsOpen(false);
      }}
    >
      <span className="dex">{number}</span>
      {progress.solved ? (
        <FlipArt
          id={id}
          name={name}
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
          {typesShown.length > 0 && (
            <div className="types overlay">
              <span className="sr-only">Revealed types: </span>
              {typesShown.map((t) => (
                <span key={t} className={`type type-${t}`}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Solved and unsolved tiles share one two-row layout so every card is
          the same height: name or input, then types or hint buttons. */}
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
        <div className={`answer${hintsOpen ? " open" : ""}`}>
          {/* Clicking anywhere in the box (including the locked letters) focuses the input. */}
          <div className={`guess${prefix ? " has-prefix" : ""}`} onClick={() => inputRef.current?.focus()}>
            <label htmlFor={inputId} className="sr-only">
              Name of {label}
            </label>
            {prefix && (
              <span className="prefix" aria-hidden="true">
                {prefix}
              </span>
            )}
            <input
              id={inputId}
              ref={inputRef}
              data-guess
              onKeyDown={onInputKeyDown}
              aria-keyshortcuts="Tab Shift+Tab ArrowDown"
              aria-describedby={prefix ? `${inputId}-hint` : undefined}
              value={guess}
              onChange={onChange}
              placeholder={!prefix ? "Who's that?" : remaining || "Enter ↵"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
            />
            {prefix && (
              <span className="sr-only" id={`${inputId}-hint`}>
                Starts with {prefix}
                {remaining ? `, then ${remaining.replace(/_/g, " blank")}` : ". Every letter revealed; press Enter"}
              </span>
            )}
          </div>
          <HintMenu
            tileLabel={label}
            options={hintOptions}
            open={hintsOpen}
            onOpenChange={setHintsOpen}
            toggleRef={hintToggleRef}
            onExitUp={() => inputRef.current?.focus()}
          />
        </div>
      )}
    </li>
  );
});
