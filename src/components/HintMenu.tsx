import { useEffect, useId, useRef, type KeyboardEvent, type RefObject } from "react";

export interface HintOption {
  key: string;
  text: string;
  label: string;
  title: string;
  done: boolean;
  onReveal: () => void;
}

interface Props {
  tileLabel: string;
  options: HintOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** ArrowUp from the hints returns to the name input. */
  onExitUp: () => void;
}

const BulbIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
  >
    <path d="M5.5 10.5a4.5 4.5 0 1 1 5 0V12h-5z" strokeLinejoin="round" />
    <path d="M6 14.5h4" />
  </svg>
);

// A small Hint circle in the card's corner that spreads into a row of hint
// buttons under the name box. The row's space is always reserved, so
// opening it never resizes the card.
export function HintMenu({ tileLabel, options, open, onOpenChange, toggleRef, onExitUp }: Props) {
  const rowId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const allDone = options.every((o) => o.done);

  // After a keyboard open/close, move focus to where the user is now:
  // the first available hint, or back to the Hint circle.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (open) rowRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    else toggleRef.current?.focus();
  }, [open, toggleRef]);

  function onToggleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onExitUp();
    } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      // Keyboard opens land on the first hint; mouse/touch opens don't steal focus.
      refocus.current = true;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onOpenChange(true);
      }
    }
  }

  // Arrows move between hints, ArrowUp returns to the input, Escape folds
  // the row back into the Hint circle.
  function onRowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (move) {
      e.preventDefault();
      buttons[i + move]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onExitUp();
    } else if (e.key === "Escape") {
      e.preventDefault();
      refocus.current = true;
      onOpenChange(false);
    }
  }

  return (
    <>
      <div
        className="hints"
        id={rowId}
        ref={rowRef}
        role="group"
        aria-label={`Hints for ${tileLabel}`}
        onKeyDown={onRowKeyDown}
      >
        {open &&
          options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.onReveal}
              disabled={o.done}
              aria-label={o.label}
              title={o.title}
            >
              {o.text}
            </button>
          ))}
      </div>
      {!open && (
        <button
          type="button"
          className="hint-toggle"
          ref={toggleRef}
          onClick={() => onOpenChange(true)}
          onKeyDown={onToggleKeyDown}
          aria-expanded={false}
          aria-controls={rowId}
          aria-label={`Hint for ${tileLabel}`}
          disabled={allDone}
          title={allDone ? "Every hint used" : "Hint"}
        >
          <BulbIcon />
        </button>
      )}
    </>
  );
}
