import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { ProgressStore, STORAGE_KEY } from "../lib/progress";
import { MemoryStorage, byName, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
afterEach(cleanup);

function setup(name: string, storage = new MemoryStorage()) {
  const species = byName(name);
  const store = new ProgressStore(storage);
  const utils = render(
    <ul>
      <Tile species={species} store={store} answers={answers} />
    </ul>,
  );
  const label = `Pokémon #${String(species.id).padStart(4, "0")}`;
  return { ...utils, species, store, storage, label, user: userEvent.setup() };
}

// Hints live behind one Hint button per tile; open it before revealing.
async function openHints(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: `Hint for ${label}` }));
}

describe("Tile", () => {
  it("starts as an unlabeled silhouette with no name or types in the DOM", () => {
    const { container, label } = setup("Bulbasaur");
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toMatch(/sil\/1\.webp$/);
    expect(img.getAttribute("alt")).toBe(`Silhouette of ${label}`);
    expect(screen.getByLabelText(`Name of ${label}`)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/bulbasaur|grass|poison/i);
  });

  it("a wrong guess has no effect: text kept, nothing revealed or flagged, Enter ignored", async () => {
    const { user, label, container, store, species } = setup("Bulbasaur");
    const input = screen.getByLabelText(`Name of ${label}`) as HTMLInputElement;
    await user.type(input, "Ivysaur{Enter}");
    expect(input.value).toBe("Ivysaur");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(container.textContent).not.toMatch(/not this one|✗/i);
    expect(screen.getByRole("img").getAttribute("src")).toMatch(/sil\//);
    expect(container.innerHTML).not.toMatch(/bulbasaur/i);
    expect(store.get(species.id).solved).toBe(false);
  });

  it("solves the moment the typed text matches, without Enter, and saves it", async () => {
    const { user, label, storage, store } = setup("Mr. Mime");
    const input = screen.getByLabelText(`Name of ${label}`);
    await user.type(input, "  mr mim");
    expect(store.get(122).solved).toBe(false);
    await user.type(input, "e");
    expect(screen.getByRole("img").getAttribute("src")).toMatch(/art\/122\.webp$/);
    expect(screen.getByText("Mr. Mime")).toBeTruthy();
    expect(screen.getByText(/Solved:/)).toBeTruthy();
    expect(screen.queryByText("✓")).toBeNull();
    expect(screen.queryByLabelText(`Name of ${label}`)).toBeNull();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).pokemon["122"].solved).toBe(true);
  });

  it("stays solved after a refresh", async () => {
    const first = setup("Pikachu");
    await first.user.type(screen.getByLabelText(`Name of ${first.label}`), "Pikachu");
    cleanup();
    setup("Pikachu", first.storage);
    expect(screen.getByText("Pikachu")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toMatch(/art\/25\.webp$/);
  });

  it("Reveal Artwork shows the art but not the name", async () => {
    const { user, label, container, store } = setup("Pikachu");
    await openHints(user, label);
    await user.click(screen.getByRole("button", { name: `Reveal artwork for ${label}` }));
    expect(screen.getByRole("img").getAttribute("src")).toMatch(/art\/25\.webp$/);
    expect(container.innerHTML).not.toMatch(/pikachu/i);
    expect(store.get(25).solved).toBe(false);
    expect((screen.getByRole("button", { name: `Artwork revealed for ${label}` }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reveal Type shows one type per click for a dual type", async () => {
    const { user, label } = setup("Bulbasaur");
    await openHints(user, label);
    const types = () => Array.from(document.querySelectorAll(".type")).map((e) => e.textContent);
    await user.click(screen.getByRole("button", { name: `Reveal Type for ${label}` }));
    expect(types()).toEqual(["grass"]);
    await user.click(screen.getByRole("button", { name: `Reveal Type for ${label}` }));
    expect(types()).toEqual(["grass", "poison"]);
    expect((screen.getByRole("button", { name: `All types revealed for ${label}` }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reveal Type on a single type shows one type, then is done", async () => {
    const { user, label } = setup("Pikachu");
    await openHints(user, label);
    await user.click(screen.getByRole("button", { name: `Reveal Type for ${label}` }));
    expect(document.querySelectorAll(".type")).toHaveLength(1);
    expect(screen.getByText("electric")).toBeTruthy();
    expect((screen.getByRole("button", { name: `All types revealed for ${label}` }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reveal Letter locks one more letter into the input per click and solves on the last", async () => {
    const { user, label, container, store } = setup("Mew");
    await openHints(user, label);
    const btn = () => screen.getByRole("button", { name: /letter/i }) as HTMLButtonElement;
    const input = () => screen.getByLabelText(`Name of ${label}`) as HTMLInputElement;
    const prefix = () => container.querySelector(".prefix")?.textContent ?? "";
    await user.click(btn());
    expect(prefix()).toBe("M");
    expect(input().placeholder).toBe("__");
    expect(input().value).toBe("");
    await user.click(btn());
    expect(prefix()).toBe("Me");
    expect(store.get(151).solved).toBe(false);
    // The last letter completes the name: no Enter needed.
    await user.click(btn());
    expect(store.get(151).solved).toBe(true);
    expect(screen.getByText("Mew")).toBeTruthy();
  });

  it("solves from the locked prefix plus the typed rest, or the full name typed", async () => {
    const a = setup("Charmander");
    await openHints(a.user, a.label);
    await a.user.click(screen.getByRole("button", { name: /Reveal Letter/ }));
    await a.user.click(screen.getByRole("button", { name: /Reveal Letter/ }));
    await a.user.type(screen.getByLabelText(`Name of ${a.label}`), "armander");
    expect(a.store.get(4).solved).toBe(true);
    cleanup();
    const b = setup("Charmander");
    await openHints(b.user, b.label);
    await b.user.click(screen.getByRole("button", { name: /Reveal Letter/ }));
    await b.user.type(screen.getByLabelText(`Name of ${b.label}`), "charmander");
    expect(b.store.get(4).solved).toBe(true);
  });

  it("revealing a letter already typed doesn't double it", async () => {
    const { user, label, store } = setup("Charmander");
    await openHints(user, label);
    const input = screen.getByLabelText(`Name of ${label}`) as HTMLInputElement;
    await user.type(input, "Cha");
    await user.click(screen.getByRole("button", { name: /Reveal Letter/ }));
    expect(input.value).toBe("ha");
    await user.type(input, "rmander");
    expect(store.get(4).solved).toBe(true);
  });

  it("Enter with a wrong answer has no effect", async () => {
    const { user, label, store } = setup("Mew");
    const input = screen.getByLabelText(`Name of ${label}`) as HTMLInputElement;
    await user.type(input, "Pikachu{Enter}");
    expect(store.get(151).solved).toBe(false);
    expect(input.value).toBe("Pikachu");
  });
});

describe("keyboard flow", () => {
  function setupWall(names: string[]) {
    const store = new ProgressStore(new MemoryStorage());
    render(
      <ul>
        {names.map((n) => (
          <Tile key={n} species={byName(n)} store={store} answers={answers} />
        ))}
      </ul>,
    );
    const input = (n: string) =>
      screen.getByLabelText(`Name of Pokémon #${String(byName(n).id).padStart(4, "0")}`) as HTMLInputElement;
    return { store, input, user: userEvent.setup() };
  }

  it("solving by typing moves focus to the next unsolved input", async () => {
    const { store, input, user } = setupWall(["Bulbasaur", "Ivysaur", "Venusaur"]);
    store.solve(2);
    await user.click(input("Bulbasaur"));
    await user.keyboard("bulbasaur");
    expect(store.get(1).solved).toBe(true);
    expect(document.activeElement).toBe(input("Venusaur"));
  });

  it("keeps focus on the tile when a longer alias may still be typed", async () => {
    const { store, input, user } = setupWall(["Nidoran♀", "Nidoran♂"]);
    await user.click(input("Nidoran♀"));
    await user.keyboard("Nidoran Female");
    expect(store.get(29).solved).toBe(true);
    expect(input("Nidoran♂").value).toBe("");
    expect(store.get(32).solved).toBe(false);
  });

  it("Tab and Shift+Tab move between unsolved inputs without submitting or clearing", async () => {
    const { store, input, user } = setupWall(["Bulbasaur", "Ivysaur", "Venusaur"]);
    store.solve(2);
    await user.click(input("Bulbasaur"));
    await user.keyboard("bulba{Tab}");
    expect(document.activeElement).toBe(input("Venusaur"));
    expect(input("Bulbasaur").value).toBe("bulba");
    expect(store.get(1).solved).toBe(false);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(input("Bulbasaur"));
  });

  it("ArrowDown reaches the Hint button, which opens onto the hints; Escape and ArrowUp go back", async () => {
    const { input, user } = setupWall(["Bulbasaur", "Ivysaur"]);
    const active = () => document.activeElement?.getAttribute("aria-label");
    await user.click(input("Bulbasaur"));
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("Hint for Pokémon #0001");
    await user.keyboard("{Enter}");
    expect(active()).toBe("Reveal artwork for Pokémon #0001");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("Reveal Type for Pokémon #0001");
    await user.keyboard("{Escape}");
    expect(active()).toBe("Hint for Pokémon #0001");
    expect(screen.queryByRole("button", { name: /Reveal/ })).toBeNull();
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(input("Bulbasaur"));
  });

  it("hints stay closed until asked for, and close when another card is used", async () => {
    const { input, user } = setupWall(["Bulbasaur", "Ivysaur"]);
    expect(screen.queryByRole("button", { name: /Reveal/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hint for Pokémon #0001" }));
    expect(screen.getByRole("button", { name: "Reveal Type for Pokémon #0001" })).toBeTruthy();
    // The Hint circle spreads into the row: it's gone while the hints show.
    expect(screen.queryByRole("button", { name: "Hint for Pokémon #0001" })).toBeNull();
    await user.click(input("Ivysaur"));
    expect(screen.queryByRole("button", { name: /Reveal/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Hint for Pokémon #0001" })).toBeTruthy();
  });

  it("marks only the card being used as engaged", async () => {
    const { input, user } = setupWall(["Bulbasaur", "Ivysaur"]);
    const tile = (n: string) => input(n).closest("li")!;
    await user.click(input("Bulbasaur"));
    expect(tile("Bulbasaur").classList.contains("engaged")).toBe(true);
    await user.click(input("Ivysaur"));
    expect(tile("Bulbasaur").classList.contains("engaged")).toBe(false);
    expect(tile("Ivysaur").classList.contains("engaged")).toBe(true);
  });
});
