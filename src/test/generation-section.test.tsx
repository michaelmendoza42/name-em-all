import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { GenerationSection } from "../App";
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
    const { container } = render(<GenerationSection group={gen1} store={store} answers={answers} />);
    const head = () => container.querySelector(".generation-head")!;
    const [last, ...rest] = gen1.species.map((s) => s.id).reverse();
    act(() => rest.forEach((id) => store.solve(id)));
    expect(head().classList.contains("complete")).toBe(false);
    act(() => store.solve(last));
    expect(head().classList.contains("complete")).toBe(true);
  });
});
