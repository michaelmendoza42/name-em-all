import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { GenerationSection } from "../App";
import { buildAnswerIndex } from "../lib/answers";
import { groupByGeneration } from "../lib/generations";
import { getIconStyle, ICON_STYLE_KEY } from "../lib/iconStyle";
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
  it("falls back to the latest earlier icon, then the earliest later one", () => {
    expect(iconFor(species, 8)?.path).toBe("icons/7/152.png");
    expect(iconFor({ id: 906, icons: [9] }, 3)).toMatchObject({ path: "icons/9/906.webp", pixelArt: false });
    expect(iconFor({ id: 1, icons: [] }, 3)).toBeUndefined();
  });
  it("offers every icon set any of a generation's species has, Gens I–II included", () => {
    expect(iconGenerations(gen1.species)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("icon fronts", () => {
  it("unlock once the generation is complete and swap every front, remembered across reloads", () => {
    const store = new ProgressStore(new MemoryStorage());
    const view = () => render(<GenerationSection group={gen1} store={store} answers={answers} />);
    const first = view();
    expect(first.container.querySelector(".icon-style")).toBeNull();
    act(() => store.solveMany(gen1.species.map((s) => s.id)));
    const select = first.container.querySelector<HTMLSelectElement>(".icon-style")!;
    expect(select.value).toBe("");
    act(() => void fireEvent.change(select, { target: { value: "3" } }));
    const fronts = () => [...document.querySelectorAll<HTMLImageElement>(".flip-front img")];
    expect(fronts()).toHaveLength(gen1.species.length);
    expect(fronts().every((img) => img.src.includes("icons/3/"))).toBe(true);
    expect(getIconStyle(1)).toBe(3);
    cleanup();
    view();
    expect(fronts().every((img) => img.src.includes("icons/3/"))).toBe(true);
  });
});
