import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export interface HintOption {
  key: string;
  icon: ReactNode;
  text: string;
  /** e.g. "1/2": how much of this hint is used up. */
  count?: string;
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
  /** ArrowUp from the Hint button returns to the name input. */
  onExitUp: () => void;
}

const svg = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none" } as const;

export const BulbIcon = () => (
  <svg {...svg} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M5.5 10.5a4.5 4.5 0 1 1 5 0V12h-5z" strokeLinejoin="round" />
    <path d="M6 14.5h4" />
  </svg>
);

export const ArtIcon = () => (
  <svg {...svg} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="m2.5 12 4-4 3 3 2-2 2.5 2.5" />
    <circle cx="11" cy="6" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const TypeIcon = () => (
  <svg {...svg} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M8 1.75 14.25 8 8 14.25 1.75 8z" />
  </svg>
);

export const LetterIcon = () => (
  <svg {...svg}>
    <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
      Aa
    </text>
  </svg>
);

// One "Hint" button that opens a small popover of hint choices. The popover
// floats over the bottom of the picture, so opening it never resizes the card.
export function HintMenu({ tileLabel, options, open, onOpenChange, toggleRef, onExitUp }: Props) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const allDone = options.every((o) => o.done);

  // Opening moves focus to the first hint still available.
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (open && focusOnOpen.current) {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
    focusOnOpen.current = false;
  }, [open]);

  function onToggleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onOpenChange(false);
      onExitUp();
    } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      // Keyboard opens land on the first hint; mouse/touch opens don't steal focus.
      focusOnOpen.current = true;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (open) menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        else onOpenChange(true);
      }
    }
  }

  // ArrowUp/Down move between hints; Escape closes back to the Hint button.
  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (move) {
      e.preventDefault();
      buttons[i + move]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      toggleRef.current?.focus();
    }
  }

  return (
    <div className={`hints${open ? " open" : ""}`}>
      {open && (
        <div
          className="hint-menu"
          id={menuId}
          ref={menuRef}
          role="group"
          aria-label={`Hints for ${tileLabel}`}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={o.onReveal}
              disabled={o.done}
              aria-label={o.label}
              title={o.title}
            >
              {o.icon}
              <span className="hint-text">{o.text}</span>
              {o.count && <span className="hint-count">{o.count}</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="hint-toggle"
        ref={toggleRef}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onToggleKeyDown}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Hint for ${tileLabel}`}
        disabled={allDone}
        title={allDone ? "Every hint used" : "Hint"}
      >
        <BulbIcon />
        Hint
      </button>
    </div>
  );
}
