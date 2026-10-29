import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
afterEach(cleanup);

// Looked up by dex number so the test never spells a name.
function mount(id: number, storage = new MemoryStorage()) {
  const species = dataset.species.find((s) => s.id === id)!;
  const store = new ProgressStore(storage);
  render(
    <ul>
      <Tile species={species} store={store} answers={answers} />
    </ul>,
  );
  const label = `Pokémon #${String(id).padStart(4, "0")}`;
  return { species, store, storage, label, user: userEvent.setup() };
}

const hintNames = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("Spellcheck hint", () => {
  it("only appears once something is typed", async () => {
    const { user, label } = mount(25);
    await user.click(screen.getByRole("button", { name: `Hint for ${label}` }));
    expect(hintNames()).not.toContain("Spellcheck");
    await user.type(screen.getByLabelText(`Name of ${label}`), "q");
    expect(hintNames()).toContain("Spellcheck");
  });

  it("turns on live grading that follows every keystroke and survives a reload", async () => {
    const { user, label, store, species, storage } = mount(25);
    const input = screen.getByLabelText(`Name of ${label}`);
    const tiles = () => Array.from(document.querySelectorAll(".guess .mark")).map((t) => t.className.split(" ")[1]);
    const guess = species.name.slice(0, 2) + "qq";
    await user.type(input, guess);
    await user.click(screen.getByRole("button", { name: `Hint for ${label}` }));
    await user.click(screen.getByRole("button", { name: `Check your spelling letter by letter for ${label}` }));
    expect(store.get(25).spellcheck).toBe(true);
    expect(document.activeElement).toBe(input);
    // One tile per typed letter, never one per letter of the name.
    expect(tiles()).toHaveLength(guess.length);
    expect(tiles().slice(0, 2)).toEqual(["g-hit", "g-hit"]);

    // Live: erasing and typing regrade straight away.
    await user.type(input, "{Backspace}{Backspace}");
    expect(tiles()).toEqual(["g-hit", "g-hit"]);
    await user.type(input, species.name[2]);
    expect(tiles()).toEqual(["g-hit", "g-hit", "g-hit"]);

    // Spent: shown as on, not offered again.
    await user.click(screen.getByRole("button", { name: `Hint for ${label}` }));
    expect((screen.getByRole("button", { name: `Spellcheck is on for ${label}` }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // A reload brings back the typed text, still graded.
    cleanup();
    mount(25, storage);
    expect((screen.getByLabelText(`Name of ${label}`) as HTMLInputElement).value).toBe(guess.slice(0, 2) + species.name[2]);
    expect(tiles()).toEqual(["g-hit", "g-hit", "g-hit"]);
  });

  it("keeps an unchecked wrong guess after a reload, and forgets it once solved", async () => {
    const { user, label, species, storage } = mount(25);
    await user.type(screen.getByLabelText(`Name of ${label}`), "zz");
    cleanup();
    const again = mount(25, storage);
    const input = screen.getByLabelText(`Name of ${label}`) as HTMLInputElement;
    expect(input.value).toBe("zz");
    await again.user.clear(input);
    await again.user.type(input, species.name);
    expect(again.store.get(25).solved).toBe(true);
    expect(again.store.draft(25)).toBe("");
  });

  it("leaves revealed letters plain, and colors only typed letters, graded after them", async () => {
    const { user, label, species } = mount(25);
    await user.click(screen.getByRole("button", { name: `Hint for ${label}` }));
    await user.click(screen.getByRole("button", { name: `Reveal Letter for ${label}` }));
    expect(document.querySelectorAll(".mark")).toHaveLength(0);
    expect(document.querySelector(".guess.wordle")).toBeNull();

    // The second letter of the name, typed after the locked first one, is in place.
    await user.type(screen.getByLabelText(`Name of ${label}`), species.name[1]);
    await user.click(screen.getByRole("button", { name: `Check your spelling letter by letter for ${label}` }));
    const tiles = Array.from(document.querySelectorAll(".mark"));
    expect(tiles.map((t) => t.className)).toEqual(["mark g-hit"]);
    expect(document.querySelector(".prefix .mark")).toBeNull();
  });
});
