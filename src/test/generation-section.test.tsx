import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { GenerationSection, JumpToNext } from "../App";
import { guessInputs } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { groupByGeneration } from "../lib/generations";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
const gen1 = groupByGeneration(dataset.species)[0];
afterEach(cleanup);

describe("GenerationSection", () => {
  it("highlights the header only once every Pokémon in the generation is solved", () => {
    const store = new ProgressStore(new MemoryStorage());
    const { container } = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    const head = () => container.querySelector(".generation-head")!;
    const [last, ...rest] = gen1.species.map((s) => s.id).reverse();
    act(() => rest.forEach((id) => store.solve(id)));
    expect(head().classList.contains("complete")).toBe(false);
    act(() => store.solve(last));
    expect(head().classList.contains("complete")).toBe(true);
  });
});

describe("GenerationSection collapse", () => {
  it("hides the generation's Pokémon and takes them out of keyboard order", () => {
    const store = new ProgressStore(new MemoryStorage());
    const { container, getByRole } = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    const toggle = getByRole("button", { expanded: true });
    const wall = container.querySelector("ol")!;
    expect(toggle.getAttribute("aria-controls")).toBe(wall.id);
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(wall.hidden).toBe(true);
    expect(guessInputs()).toHaveLength(0);
    act(() => toggle.click());
    expect(wall.hidden).toBe(false);
    expect(guessInputs()).toHaveLength(gen1.species.length);
  });

  it("restores a collapsed generation after a reload", () => {
    const store = new ProgressStore(new MemoryStorage());
    const first = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    act(() => first.getByRole("button", { expanded: true }).click());
    first.unmount();
    const { container } = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    expect(container.querySelector("ol")!.hidden).toBe(true);
    act(() => void container.querySelector<HTMLButtonElement>(".collapse-toggle")!.click());
    cleanup();
    const again = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    expect(again.container.querySelector("ol")!.hidden).toBe(false);
  });
});

describe("JumpToNext", () => {
  afterEach(() => vi.useRealTimers());

  it("shows on scroll, hides 3s after scrolling stops or when an input is focused", () => {
    vi.useFakeTimers();
    const store = new ProgressStore(new MemoryStorage());
    const { container } = render(
      <>
        <GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />
        <JumpToNext />
      </>,
    );
    const jump = container.querySelector(".jump")!;
    expect(jump.classList.contains("shown")).toBe(false);
    act(() => void window.dispatchEvent(new Event("scroll")));
    expect(jump.classList.contains("shown")).toBe(true);
    act(() => void vi.advanceTimersByTime(2900));
    expect(jump.classList.contains("shown")).toBe(true);
    act(() => void vi.advanceTimersByTime(200));
    expect(jump.classList.contains("shown")).toBe(false);

    act(() => void window.dispatchEvent(new Event("scroll")));
    act(() => guessInputs()[0].focus());
    expect(jump.classList.contains("shown")).toBe(false);
  });
});
