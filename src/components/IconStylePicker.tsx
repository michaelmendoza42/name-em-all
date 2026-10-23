import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Species } from "../lib/dataset";
import { romanGeneration } from "../lib/generations";
import { iconFor } from "../lib/sprites";
import "./icon-picker.css";

const BASE = import.meta.env.BASE_URL;

type Choice = number | undefined; // icon generation; undefined = artwork

interface Props {
  title: string; // "Generation I", for labels
  choices: readonly number[]; // icon generations on offer, oldest first
  value: Choice;
  onChange: (choice: Choice) => void;
  sample: Species; // previews each style
  unlocked: readonly number[]; // generations whose icons a preview may fall back to
  jiggle: boolean; // the generation was just completed
}

function Preview({ sample, choice, unlocked }: { sample: Species; choice: Choice; unlocked: readonly number[] }) {
  const icon = choice === undefined ? undefined : iconFor(sample, choice, unlocked);
  return icon ? (
    <img className={`style-preview${icon.pixelArt ? " pixel" : ""}`} src={`${BASE}${icon.path}`} alt="" draggable={false} />
  ) : (
    <img className="style-preview artwork" src={`${BASE}art/${sample.id}.webp`} alt="" draggable={false} />
  );
}

// What a completed generation's cards show on their fronts. A pixel-framed
// button shows the current style on the generation's first Pokémon; it opens
// a Gen III-style menu (portaled, so the header's clipping doesn't cut it
// off) where the ▶ cursor follows hover or ↑/↓ and each line previews its style.
export function IconStylePicker({ title, choices, value, onChange, sample, unlocked, jiggle }: Props) {
  const options: Choice[] = [undefined, ...choices];
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const label = (c: Choice) => (c === undefined ? "Artwork" : `Gen ${romanGeneration(c)} icons`);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!open || !button) return;
    const r = button.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setCursor(Math.max(0, options.indexOf(value)));
    menuRef.current?.focus();
  }, [open]); // value and options are read, not tracked: this only runs on opening

  // Tapping elsewhere or scrolling (the button moves; the menu is fixed) closes it.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function pick(i: number) {
    onChange(options[i]);
    close();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`style-button${jiggle ? " jiggle" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Card fronts for ${title}: ${label(value)}`}
        title="Card fronts"
        onClick={() => setOpen((o) => !o)}
      >
        <Preview sample={sample} choice={value} unlocked={unlocked} />
      </button>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            className="style-menu"
            role="listbox"
            tabIndex={-1}
            aria-label={`Card fronts for ${title}`}
            aria-activedescendant={`${menuId}-${cursor}`}
            style={{ top: pos.top, right: pos.right }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setCursor((c) => (c + 1) % options.length);
              else if (e.key === "ArrowUp") setCursor((c) => (c - 1 + options.length) % options.length);
              else if (e.key === "Enter" || e.key === " ") pick(cursor);
              else if (e.key === "Escape" || e.key === "Tab") close();
              else return;
              e.preventDefault();
            }}
          >
            {options.map((c, i) => (
              <li
                key={c ?? "art"}
                id={`${menuId}-${i}`}
                role="option"
                aria-selected={c === value}
                aria-label={label(c)}
                className={i === cursor ? "cursor" : undefined}
                onPointerEnter={() => setCursor(i)}
                onClick={() => pick(i)}
              >
                <span className="caret" aria-hidden="true">
                  ▶
                </span>
                <span className="style-label">{c === undefined ? "ARTWORK" : `GEN ${romanGeneration(c)}`}</span>
                <span className="style-preview-slot">
                  <Preview sample={sample} choice={c} unlocked={unlocked} />
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
