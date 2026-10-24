import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("GenerationSection level-up", () => {
  afterEach(() => vi.useRealTimers());

  it("plays when the last Pokémon is named, then closes by itself", () => {
    vi.useFakeTimers();
    const store = new ProgressStore(new MemoryStorage());
    const { container } = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    const box = () => container.querySelector(".level-up-box");
    act(() => store.solveMany(gen1.species.map((s) => s.id)));
    expect(box()).not.toBeNull();
    expect(box()!.textContent).toContain("KANTO POKéDEX complete!");
    // Each typed character schedules the next, so let React render in between.
    for (let t = 0; t < 12000; t += 100) act(() => void vi.advanceTimersByTime(100));
    expect(box()).toBeNull();
  });

  it("doesn't play for a generation already complete on load", () => {
    const store = new ProgressStore(new MemoryStorage());
    store.solveMany(gen1.species.map((s) => s.id));
    const { container } = render(<GenerationSection group={gen1} store={store} answers={answers} iconStyles={[]} />);
    expect(container.querySelector(".level-up-box")).toBeNull();
  });

  it("keeps focus on the last card instead of moving to the next generation", async () => {
    const store = new ProgressStore(new MemoryStorage());
    const [gen1Group, gen2Group] = groupByGeneration(dataset.species);
    render(
      <>
        <GenerationSection group={gen1Group} store={store} answers={answers} iconStyles={[]} />
        {gen2Group && <GenerationSection group={gen2Group} store={store} answers={answers} iconStyles={[]} />}
      </>,
    );
    const [last, ...rest] = [...gen1Group.species].reverse();
    act(() => store.solveMany(rest.map((s) => s.id)));
    const user = userEvent.setup();
    await user.click(guessInputs()[0]);
    await user.keyboard(last.name);
    expect(store.get(last.id).solved).toBe(true);
    expect(document.activeElement?.textContent).toContain(last.name);
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
