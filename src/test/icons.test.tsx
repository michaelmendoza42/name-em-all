import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { GenerationSection } from "../App";
import { buildAnswerIndex } from "../lib/answers";
import { groupByGeneration } from "../lib/generations";
import { getIconStyle, ICON_STYLE_KEY, unlockedIconStyles } from "../lib/iconStyle";
import { ProgressStore } from "../lib/progress";
import { iconFor, iconGenerations } from "../lib/sprites";
import { MemoryStorage, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
const gen1 = groupByGeneration(dataset.species)[0];
afterEach(() => {
  cleanup();
  localStorage.removeItem(ICON_STYLE_KEY);
});

describe("iconFor", () => {
  const species = { id: 152, icons: [3, 4, 5, 6, 7, 9] };
  it("uses the chosen generation's icon when there is one", () => {
    expect(iconFor(species, 4)).toMatchObject({ path: "icons/4/152.png", pixelArt: true });
  });
  it("falls back only to allowed generations when given", () => {
    expect(iconFor(species, 8, [3, 9])?.path).toBe("icons/3/152.png");
    expect(iconFor(species, 8, [8])).toBeUndefined();
  });
  it("falls back to the latest earlier icon, then the earliest later one", () => {
    expect(iconFor(species, 8)?.path).toBe("icons/7/152.png");
    expect(iconFor({ id: 906, icons: [9] }, 3)).toMatchObject({ path: "icons/9/906.webp", pixelArt: false });
    expect(iconFor({ id: 1, icons: [] }, 3)).toBeUndefined();
  });
  it("offers every icon set any of a generation's species has, Gens I–II included", () => {
    expect(iconGenerations(gen1.species)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("unlockedIconStyles", () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  it("unlocks a style by completing its own generation; Gens I–II do nothing alone", () => {
    expect(unlockedIconStyles([1, 2], all)).toEqual([]);
    expect(unlockedIconStyles([1, 3, 7], all)).toEqual([3, 7]);
  });
  it("adds Gens I–II's party icons once every generation is complete", () => {
    expect(unlockedIconStyles(all, all)).toEqual(all);
  });
});

describe("icon fronts", () => {
  const pickerButton = () => document.querySelector<HTMLButtonElement>(".style-button");
  const fronts = () => [...document.querySelectorAll<HTMLImageElement>(".flip-front img")];

  it("offer only unlocked styles on a completed generation, remembered across reloads", () => {
    const store = new ProgressStore(new MemoryStorage());
    const view = (styles: number[]) =>
      render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={styles} />);
    const first = view([3, 9]);
    expect(pickerButton()).toBeNull();
    act(() => store.solveMany(gen1.species.map((s) => s.id)));
    act(() => pickerButton()!.click());
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("aria-label"));
    expect(options).toEqual(["Artwork", "Gen III icons", "Gen IX icons"]);
    act(() => void fireEvent.click(document.querySelector('[aria-label="Gen III icons"]')!));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(fronts()).toHaveLength(gen1.species.length);
    expect(fronts().every((img) => img.src.includes("icons/3/"))).toBe(true);
    expect(getIconStyle(1)).toBe(3);
    first.unmount();
    view([3, 9]);
    expect(fronts().every((img) => img.src.includes("icons/3/"))).toBe(true);
    cleanup();
    // Style no longer unlocked: back to artwork, saved choice kept.
    view([9]);
    expect(fronts().every((img) => img.src.includes("art/"))).toBe(true);
  });

  it("picks by keyboard: arrows move the cursor, Enter chooses, Escape closes", () => {
    const store = new ProgressStore(new MemoryStorage());
    store.solveMany(gen1.species.map((s) => s.id));
    render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[3, 9]} />);
    act(() => pickerButton()!.click());
    const menu = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(document.activeElement).toBe(menu);
    act(() => void fireEvent.keyDown(menu, { key: "ArrowUp" }));
    act(() => void fireEvent.keyDown(menu, { key: "Enter" }));
    expect(getIconStyle(1)).toBe(9);
    expect(document.activeElement).toBe(pickerButton());
    act(() => pickerButton()!.click());
    act(() => void fireEvent.keyDown(document.querySelector('[role="listbox"]')!, { key: "Escape" }));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
