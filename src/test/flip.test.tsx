import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, byName, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
afterEach(cleanup);

function setupSolved(name: string) {
  const species = byName(name);
  const store = new ProgressStore(new MemoryStorage());
  store.solve(species.id);
  const utils = render(
    <ul>
      <Tile species={species} store={store} answers={answers} />
    </ul>,
  );
  return { ...utils, species, user: userEvent.setup() };
}

describe("solved card flip", () => {
  it("dataset marks which species have an animated sprite", () => {
    expect(byName("Pikachu").animated).toBe(true);
    expect(byName("Pecharunt").animated).toBe(false);
  });

  it("flips to the animated sprite on click, loading it only then, and back again", async () => {
    const { user, container } = setupSolved("Pikachu");
    const card = screen.getByRole("button", { name: "Flip card to see Pikachu animated" });
    expect(card.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('img[src$="anim/25.gif"]')).toBeNull();

    await user.click(card);
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.classList.contains("flipped")).toBe(true);
    expect(container.querySelector('img[src$="anim/25.gif"]')).not.toBeNull();

    await user.click(card);
    expect(card.getAttribute("aria-pressed")).toBe("false");
    expect(card.classList.contains("flipped")).toBe(false);
  });

  it("flips from the keyboard", async () => {
    const { user } = setupSolved("Pikachu");
    const card = screen.getByRole("button", { name: /Flip card/ });
    card.focus();
    await user.keyboard("{Enter}");
    expect(card.getAttribute("aria-pressed")).toBe("true");
    await user.keyboard(" ");
    expect(card.getAttribute("aria-pressed")).toBe("false");
  });

  it("is a plain, non-flippable image when no animated sprite exists", () => {
    const { container } = setupSolved("Pecharunt");
    expect(screen.queryByRole("button", { name: /Flip card/ })).toBeNull();
    expect(container.querySelector('img[src$="art/1025.webp"]')).not.toBeNull();
  });

  it("unsolved tiles never flip", () => {
    const species = byName("Pikachu");
    render(
      <ul>
        <Tile species={species} store={new ProgressStore(new MemoryStorage())} answers={answers} />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: /Flip card/ })).toBeNull();
  });
});
