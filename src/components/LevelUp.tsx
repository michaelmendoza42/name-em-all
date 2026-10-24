import { type CSSProperties, useEffect, useRef, useState } from "react";
import "./level-up.css";

// When the bar's fill (an 0.8s transition) has reached the end; the burst
// and the text box wait for it.
const FILL_MS = 800;
const CHAR_MS = 32;
// How long the finished message stays up before it closes on its own.
const LINGER_MS = 4500;
const CLOSE_MS = 250;

// Sparkles and Poké Balls thrown off the full bar: where along it each one
// starts (%), how far it flies (px), and how long it waits (ms).
const PARTICLES: { x: number; dx: number; dy: number; delay: number; ball?: boolean }[] = [
  { x: 6, dx: -18, dy: -34, delay: 0 },
  { x: 14, dx: 10, dy: 30, delay: 120, ball: true },
  { x: 22, dx: -8, dy: -42, delay: 60 },
  { x: 31, dx: 16, dy: 36, delay: 200 },
  { x: 39, dx: -14, dy: -30, delay: 140, ball: true },
  { x: 47, dx: 6, dy: 44, delay: 20 },
  { x: 55, dx: 12, dy: -40, delay: 180 },
  { x: 63, dx: -10, dy: 32, delay: 80, ball: true },
  { x: 71, dx: 18, dy: -36, delay: 240 },
  { x: 79, dx: -16, dy: 38, delay: 40 },
  { x: 87, dx: 8, dy: -44, delay: 160, ball: true },
  { x: 95, dx: 20, dy: 28, delay: 100 },
];

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// A generation's Gen 3 level-up: a burst off the EXP bar, then a battle text
// box that types out the news. Clicking the box (or waiting) closes it.
export function LevelUp({ name, count, onDone }: { name: string; count: number; onDone: () => void }) {
  const lines = [`${name.toUpperCase()} POKéDEX complete!`, `All ${count} Pokémon named!`];
  const full = lines.join("\n");
  const [typed, setTyped] = useState(() => (reducedMotion() ? full.length : 0));
  const [closing, setClosing] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  // Type the message one character at a time, after the bar fills.
  useEffect(() => {
    if (typed >= full.length) return;
    const t = window.setTimeout(() => setTyped((n) => n + 1), typed === 0 ? FILL_MS + 300 : CHAR_MS);
    return () => clearTimeout(t);
  }, [typed, full.length]);

  useEffect(() => {
    if (closing) {
      const t = window.setTimeout(() => done.current(), CLOSE_MS);
      return () => clearTimeout(t);
    }
    if (typed < full.length) return;
    const t = window.setTimeout(() => setClosing(true), LINGER_MS);
    return () => clearTimeout(t);
  }, [closing, typed, full.length]);

  const shown = full.slice(0, typed);
  return (
    <>
      <div className="level-up-burst" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className={p.ball ? "level-up-ball" : "level-up-spark"}
            style={
              {
                left: `${p.x}%`,
                "--dx": `${p.dx * 2}px`,
                "--dy": `${p.dy * 1.6}px`,
                animationDelay: `${FILL_MS + p.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div
        className={closing ? "level-up-box closing" : "level-up-box"}
        role="status"
        onClick={() => setClosing(true)}
      >
        <span className="sr-only">{lines.join(" ")}</span>
        <p aria-hidden="true">
          {shown}
          {typed >= full.length && <span className="level-up-more" />}
        </p>
      </div>
    </>
  );
}
