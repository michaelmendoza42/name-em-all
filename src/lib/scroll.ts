// Eased window scrolling for moving focus between tiles. Native focus()
// scrolling jumps instantly, which feels abrupt when the next unsolved tile
// is several rows (or a whole generation) away.

const MIN_MS = 220;
const MAX_MS = 900;

let frame = 0;
// When the last scripted scroll ran, so scroll listeners can tell a glide
// apart from the user scrolling.
let lastGlide = -Infinity;
let cancelListeners: (() => void) | undefined;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// True during a glide and briefly after it (its final scroll event lands late).
export function isGliding(): boolean {
  return frame !== 0 || performance.now() - lastGlide < 150;
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  cancelListeners?.();
  cancelListeners = undefined;
}

// Longer trips take longer, but grow logarithmically so a jump across the
// page doesn't drag on: one screen ≈ 400ms, ten screens hit the cap.
export function scrollDuration(distance: number, viewport: number): number {
  const screens = Math.abs(distance) / Math.max(viewport, 1);
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, MIN_MS + 180 * Math.log2(1 + screens))));
}

// How far the window must scroll for `el` to sit centred below the sticky
// top bar (html's scroll-padding-top), like scrollIntoView({ block: "center" }).
// With `ifHidden`, 0 when it's already fully in view there.
function scrollDelta(el: Element, ifHidden = false): number {
  const rect = el.getBoundingClientRect();
  const padTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const viewH = window.innerHeight;
  if (ifHidden && rect.top >= padTop && rect.bottom <= viewH) return 0;
  return rect.top + rect.height / 2 - (padTop + (viewH - padTop) / 2);
}

// Focuses `input` without the browser's instant jump, then glides its tile
// into view if it isn't already. Wheel, touch or keys cancel the glide.
export function focusAndGlide(input: HTMLElement) {
  input.focus({ preventScroll: true });
  const tile = input.closest("li") ?? input;
  if (scrollDelta(tile, true)) glide(() => scrollDelta(tile));
}

// Glides the window until `el`'s top sits just under the sticky top bar.
export function glideToTop(el: Element) {
  const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 0;
  glide(() => el.getBoundingClientRect().top - barH);
}

// `remaining` says how far is left to scroll. It's asked again every frame,
// so the glide still lands if the page above the target changes height
// mid-way (e.g. a finished generation leaving Hard Mode's wall).
function glide(remaining: () => number) {
  const delta = remaining();
  if (!delta) return;
  stop();
  lastGlide = performance.now();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    window.scrollBy(0, delta);
    return;
  }
  const from = window.scrollY;
  const duration = scrollDuration(delta, window.innerHeight);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const to = window.scrollY + remaining();
    window.scrollTo(0, from + (to - from) * easeInOutCubic(t));
    lastGlide = now;
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  // Let the user take over mid-glide instead of fighting them.
  const opts = { passive: true } as const;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  window.addEventListener("pointerdown", stop, opts);
  cancelListeners = () => {
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("pointerdown", stop);
  };
  frame = requestAnimationFrame(step);
}
