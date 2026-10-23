import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { groupDexEntries, parseDexEntries } from "../lib/dexEntries";
import { ProgressStore } from "../lib/progress";
import { spriteSlides } from "../lib/sprites";
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

const label = (container: HTMLElement) => container.querySelector(".sprite-label")?.textContent;
const activeDot = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".sprite-dots span")).findIndex((d) => d.classList.contains("on"));

describe("solved card flip", () => {
  it("dataset lists each species' sprite generations, and a distinct animated sprite", () => {
    expect(byName("Pikachu").sprites).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(byName("Pikachu").animated).toBe(true);
    expect(byName("Chikorita").sprites?.[0]).toBe(2);
  });

  it("flips the picture to the sprites and the footer to Pokédex entries, loading them only then", async () => {
    const { user, container } = setupSolved("Pikachu");
    const front = screen.getByRole("button", { name: "Flip card to see Pikachu's sprites and Pokédex entries" });
    expect(container.querySelector(".sprite-slide img")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(front);
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(true);
    expect(container.querySelector(".foot")!.classList.contains("flipped")).toBe(true);
    expect(container.querySelector('img[src$="sprites/1/25.png"]')).not.toBeNull();
    expect(container.querySelector('img[src$="sprites/9/25.webp"]')).not.toBeNull();
    expect(container.querySelector('img[src$="anim/25.gif"]')).not.toBeNull();
    expect(label(container)).toBe("Gen I");
    expect(container.querySelectorAll(".sprite-dots span")).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/dex\/25\.json$/));

    // The entries replace the footer (name and types), not the picture.
    const region = await screen.findByRole("region", { name: "Pikachu's Pokédex entries" });
    expect(region.closest(".foot")).not.toBeNull();
    expect(region.closest(".art")).toBeNull();
    expect(await within(region).findByRole("heading", { name: "Gen I" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "Gen VIII" })).toBeTruthy();
    expect(region.textContent).toContain("Red · Blue");
    expect(region.textContent).toContain("When several of these Pokémon gather");

    // Clicking inside the entries (to scroll or select) keeps the card flipped.
    await user.click(region);
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(true);
  });

  it("pages with the chevrons, and remembers the sprite across flips", async () => {
    const { user, container } = setupSolved("Pikachu");
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    const prev = screen.getByRole("button", { name: "Previous sprite" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next sprite" });
    expect(prev.disabled).toBe(true);

    await user.click(next);
    await user.click(next);
    expect(label(container)).toBe("Gen III");
    expect(activeDot(container)).toBe(2);
    await user.click(prev);
    expect(label(container)).toBe("Gen II");

    // Flip back (clicking the sprite), then over again: still on Gen II.
    await user.click(screen.getByRole("group", { name: /Pikachu's sprites/ }));
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(false);
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    expect(label(container)).toBe("Gen II");
    expect(activeDot(container)).toBe(1);
  });

  it("works from the keyboard: Enter flips, arrows page, Enter flips back", async () => {
    const { user, container } = setupSolved("Bulbasaur");
    const front = screen.getByRole("button", { name: /Flip card to see/ });
    front.focus();
    await user.keyboard("{Enter}");
    const track = screen.getByRole("group", { name: /Bulbasaur's sprites/ });
    expect(document.activeElement).toBe(track);
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");
    expect(label(container)).toBe("Gen II");
    await user.keyboard("{Enter}");
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(false);
    expect(document.activeElement).toBe(front);
  });

  it("starts at the generation the species debuted in", async () => {
    const { user, container } = setupSolved("Pecharunt");
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    expect(label(container)).toBe("Gen IX");
    expect(screen.queryByRole("button", { name: "Next sprite" })).toBeNull();
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

describe("sprite files", () => {
  it("every listed sprite exists on disk", () => {
    for (const s of dataset.species) {
      for (const slide of spriteSlides(s)) {
        expect(existsSync(path.resolve(process.cwd(), "public", slide.path)), slide.path).toBe(true);
      }
    }
  });

  it("no species lists a sprite from before it existed", () => {
    for (const s of dataset.species) expect(s.sprites?.every((g) => g >= s.generation), s.name).toBe(true);
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
