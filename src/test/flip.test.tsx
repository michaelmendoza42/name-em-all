import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { groupDexEntries, parseDexEntries } from "../lib/dexEntries";
import { ProgressStore } from "../lib/progress";
import { MemoryStorage, byName, dataset } from "./fixtures";

const answers = buildAnswerIndex(dataset.species);
const dexFile = (id: number) => path.resolve(process.cwd(), `public/dex/${id}.json`);
const fetchMock = vi.fn();

beforeEach(() => {
  // Serve public/dex/<id>.json from disk; ids are unique per test so the
  // loader's per-URL cache never hides a request.
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const id = Number(/dex\/(\d+)\.json$/.exec(url)?.[1]);
    return new Response(readFileSync(dexFile(id), "utf8"));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("flips to the animated sprite and Pokédex entries, loading them only then, and back again", async () => {
    const { user, container } = setupSolved("Pikachu");
    const front = screen.getByRole("button", { name: "Flip card to see Pikachu's Pokédex entries" });
    expect(container.querySelector('img[src$="anim/25.gif"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(front);
    const card = container.querySelector(".flip")!;
    expect(card.classList.contains("flipped")).toBe(true);
    expect(container.querySelector('img[src$="anim/25.gif"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/dex\/25\.json$/));

    const region = await screen.findByRole("region", { name: "Pikachu's Pokédex entries" });
    expect(await within(region).findByRole("heading", { name: "Gen I" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "Gen VIII" })).toBeTruthy();
    expect(region.textContent).toContain("Red · Blue");
    expect(region.textContent).toContain("When several of these Pokémon gather");

    // Clicking inside the entries (to scroll or select) keeps the card flipped.
    await user.click(region);
    expect(card.classList.contains("flipped")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Flip Pikachu's card back" }));
    expect(card.classList.contains("flipped")).toBe(false);
  });

  it("flips from the keyboard, keeping focus on the visible face", async () => {
    const { user } = setupSolved("Bulbasaur");
    const front = screen.getByRole("button", { name: /Flip card to see/ });
    front.focus();
    await user.keyboard("{Enter}");
    const back = screen.getByRole("button", { name: "Flip Bulbasaur's card back" });
    expect(document.activeElement).toBe(back);
    await user.keyboard(" ");
    expect(document.activeElement).toBe(front);
  });

  it("flips to the still artwork plus entries when no animated sprite exists", async () => {
    const { user, container } = setupSolved("Pecharunt");
    await user.click(screen.getByRole("button", { name: /Flip card to see Pecharunt/ }));
    expect(container.querySelector('.flip-sprite img[src$="art/1025.webp"]')).not.toBeNull();
    const region = await screen.findByRole("region", { name: "Pecharunt's Pokédex entries" });
    expect(await within(region).findByRole("heading", { name: "Gen IX" })).toBeTruthy();
  });

  it("offers a retry when the entries fail to load", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    const { user } = setupSolved("Ivysaur");
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    const region = screen.getByRole("region", { name: "Ivysaur's Pokédex entries" });
    expect(await within(region).findByRole("heading", { name: "Gen I" })).toBeTruthy();
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

describe("Pokédex entry files", () => {
  it("every species has well-formed entries, in clean text", () => {
    for (const s of dataset.species) {
      const entries = parseDexEntries(JSON.parse(readFileSync(dexFile(s.id), "utf8")));
      expect(entries.length, `#${s.id}`).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.text, `#${s.id}`).not.toMatch(/[\n\f­]|POK[ÉéE]MON/);
      }
    }
  });

  it("rewrites capitalized species names from the old games", () => {
    const text = (id: number) => parseDexEntries(JSON.parse(readFileSync(dexFile(id), "utf8"))).map((e) => e.text);
    expect(text(25).join(" ")).not.toContain("PIKACHU");
    expect(text(25).join(" ")).toContain("Pikachu");
  });

  it("groups entries by generation, oldest first", () => {
    const groups = groupDexEntries([
      { generation: 3, versions: ["Ruby"], text: "c" },
      { generation: 1, versions: ["Red", "Blue"], text: "a" },
      { generation: 1, versions: ["Yellow"], text: "b" },
    ]);
    expect(groups.map((g) => [g.generation, g.entries.map((e) => e.text)])).toEqual([
      [1, ["a", "b"]],
      [3, ["c"]],
    ]);
  });
});
