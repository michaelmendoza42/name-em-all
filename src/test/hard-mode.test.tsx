import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, type Stores } from "../App";
import { MODE_KEY, MODES, savedMode, saveMode } from "../lib/modes";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, dataset } from "./fixtures";

const pokedex = readFileSync(path.resolve(process.cwd(), "public/pokedex.json"), "utf8");
const lookalikes = readFileSync(path.resolve(process.cwd(), "public/lookalikes.json"), "utf8");
const gen1 = dataset.species.filter((s) => s.generation === 1).map((s) => s.id);

let storage: MemoryStorage;
let stores: Stores;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  stores = Object.fromEntries(MODES.map((m) => [m.mode, new ProgressStore(storage, m.progressKey)])) as Stores;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(url.endsWith("lookalikes.json") ? lookalikes : pokedex)),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("saved mode", () => {
  it("defaults to the Pokédex and remembers Hard Mode", () => {
    const s = new MemoryStorage();
    expect(savedMode(s)).toBe("dex");
    saveMode("hard", s);
    expect(savedMode(s)).toBe("hard");
    saveMode("dex", s);
    expect(s.getItem(MODE_KEY)).toBeNull();
  });
});

describe("switching modes", () => {
  it("asks before going hard, starts from zero, and keeps Pokédex progress aside", async () => {
    stores.dex.solveMany(gen1);
    render(<App stores={stores} />);
    await screen.findByRole("heading", { name: /Kanto/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Hard Mode…" }));
    // The lookalike grouping and generation sections are left as surprises.
    expect(screen.getByRole("dialog", { name: "Switch to Hard Mode?" }).textContent).not.toMatch(
      /lookalike|alike|similar|section/i,
    );
    await user.click(screen.getByRole("button", { name: "Start Hard Mode" }));
    expect(savedMode(storage)).toBe("hard");
    expect(window.location.pathname).toBe("/hard-mode");
    await screen.findByRole("list", { name: "Hard Mode wall" });
    expect(stores.hard.solvedCount(gen1)).toBe(0);
    expect(stores.dex.solvedCount(gen1)).toBe(gen1.length);
  });

  it("erases Hard Mode progress on leaving", async () => {
    saveMode("hard", storage);
    stores.hard.solve(25);
    window.history.replaceState(null, "", "/hard-mode");
    render(<App stores={stores} />);
    await screen.findByRole("list", { name: "Hard Mode wall" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Back to the Pokédex…" }));
    expect(screen.getByRole("dialog", { name: "Leave Hard Mode?" }).textContent).toContain("the 1 Pokémon");
    await user.click(screen.getByRole("button", { name: "Erase & leave" }));
    expect(savedMode(storage)).toBe("dex");
    expect(stores.hard.get(25).solved).toBe(false);
  });

  it("a link to the other mode's path asks instead of switching", async () => {
    window.history.replaceState(null, "", "/hard-mode");
    render(<App stores={stores} />);
    expect(await screen.findByRole("dialog", { name: "Switch to Hard Mode?" })).toBeTruthy();
    expect(savedMode(storage)).toBe("dex");
  });
});

describe("Hard Mode arrangement", () => {
  const wallIds = () =>
    Array.from(document.querySelectorAll<HTMLImageElement>('ol[aria-label="Hard Mode wall"] img')).map((img) =>
      Number(img.getAttribute("src")!.match(/(\d+)\.webp$/)![1]),
    );

  it("is the canonical wall on a first run and a new one after leaving and coming back", async () => {
    const canonical = JSON.parse(lookalikes) as { round: number[]; runs: number[][] };
    render(<App stores={stores} />);
    await screen.findByRole("heading", { name: /Kanto/ });
    const user = userEvent.setup();
    const enter = async () => {
      await user.click(screen.getByRole("button", { name: "More options" }));
      await user.click(screen.getByRole("button", { name: "Hard Mode…" }));
      await user.click(screen.getByRole("button", { name: "Start Hard Mode" }));
      await screen.findByRole("list", { name: "Hard Mode wall" });
    };
    await enter();
    const first = wallIds();
    expect(first).toEqual([...canonical.round, ...canonical.runs.flat()]);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Back to the Pokédex…" }));
    await user.click(screen.getByRole("button", { name: "Erase & leave" }));
    await enter();
    expect(wallIds()).not.toEqual(first);
    expect([...wallIds()].sort((a, b) => a - b)).toEqual([...first].sort((a, b) => a - b));
    // Renders the whole 1,025-card wall three times, so it needs longer than the default 5s.
  }, 20_000);
});

describe("Hard Mode wall", () => {
  it("keeps solved cards in the wall until their generation is complete, then gives it a section", async () => {
    saveMode("hard", storage);
    render(<App stores={stores} />);
    const wall = await screen.findByRole("list", { name: "Hard Mode wall" });
    const [last, ...rest] = gen1;
    act(() => stores.hard.solveMany(rest));
    expect(wall.querySelectorAll('[data-gen="1"]').length).toBe(gen1.length);
    expect(wall.querySelectorAll('[data-gen="1"].solved').length).toBe(rest.length);
    expect(screen.queryByRole("heading", { name: /Kanto/ })).toBeNull();
    act(() => stores.hard.solve(last));
    expect(wall.querySelectorAll('[data-gen="1"]').length).toBe(0);
    expect(screen.getByRole("heading", { name: /Kanto/ })).toBeTruthy();
    expect(document.querySelector(".level-up-box")).not.toBeNull();
  });
});
