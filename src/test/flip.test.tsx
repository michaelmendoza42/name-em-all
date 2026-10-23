import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tile } from "../components/Tile";
import { buildAnswerIndex } from "../lib/answers";
import { groupDexEntries, parseDexEntries } from "../lib/dexEntries";
import { ProgressStore } from "../lib/progress";
import { backSpritePath, iconPath, spriteSlides } from "../lib/sprites";
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
    // Each generation is a battle scene: front sprite as the foe, back sprite as yours.
    expect(container.querySelector('.battle .foe img[src$="sprites/1/25.png"]')).not.toBeNull();
    expect(container.querySelector('.battle .ally img[src$="sprites/back/1/25.png"]')).not.toBeNull();
    expect(container.querySelectorAll(".sprite-slide.battle")).toHaveLength(9);
    expect(container.querySelector('.sprite-slide:not(.battle) img[src$="anim/25.gif"]')).not.toBeNull();
    expect(label(container)).toBe("Gen I");
    expect(container.querySelectorAll(".sprite-dots span")).toHaveLength(10);
    expect(activeDot(container)).toBe(0);
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

  it("opens on the premiere generation, pages with the chevrons, wrapping both ways, and remembers the sprite across flips", async () => {
    const { user, container } = setupSolved("Pikachu");
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    const prev = screen.getByRole("button", { name: "Previous sprite" });
    const next = screen.getByRole("button", { name: "Next sprite" });
    expect(label(container)).toBe("Gen I");

    // Back from the first slide is the last (the animated sprite), and past it the first.
    await user.click(prev);
    expect(label(container)).toBe("Animated");
    expect(activeDot(container)).toBe(9);
    await user.click(next);
    expect(label(container)).toBe("Gen I");
    await user.click(prev);
    await user.click(prev);
    await user.click(prev);
    await user.click(prev);
    expect(label(container)).toBe("Gen VII");
    expect(activeDot(container)).toBe(6);

    // Flip back (clicking the sprite), then over again: still on Gen VII.
    await user.click(screen.getByRole("group", { name: /Pikachu's sprites/ }));
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(false);
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    expect(label(container)).toBe("Gen VII");
    expect(activeDot(container)).toBe(6);
  });

  it("scrolls the entries to the sprite's generation, one way", async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const { user, container } = setupSolved("Pikachu");
    await user.click(screen.getByRole("button", { name: /Flip card to see/ }));
    const region = await screen.findByRole("region", { name: "Pikachu's Pokédex entries" });
    await within(region).findByRole("heading", { name: "Gen I" });
    const current = () => region.querySelector(".dex-gen.current")?.getAttribute("data-gen");
    // The carousel's track scrolls too; only count the entries' own scrolls.
    const regionScrolls = () => scrollTo.mock.calls.filter((_, i) => scrollTo.mock.contexts[i] === region);

    expect(current()).toBe("1");
    expect(regionScrolls().at(-1)?.[0]).toMatchObject({ behavior: "instant" });

    // Back past Gen I wraps to the animated sprite, then on to Gen IX, VIII, VII.
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Previous sprite" }));
    expect(label(container)).toBe("Gen VII");
    expect(current()).toBe("7");
    expect(regionScrolls().at(-1)?.[0]).toMatchObject({ behavior: "smooth" });

    // Scrolling the entries leaves the carousel alone.
    region.scrollTop = 0;
    region.dispatchEvent(new Event("scroll"));
    expect(label(container)).toBe("Gen VII");

    // The animated sprite has no generation: the entries stay put.
    const calls = regionScrolls().length;
    await user.click(screen.getByRole("button", { name: "Next sprite" }));
    await user.click(screen.getByRole("button", { name: "Next sprite" }));
    await user.click(screen.getByRole("button", { name: "Next sprite" }));
    expect(label(container)).toBe("Animated");
    expect(current()).toBeUndefined();
    expect(regionScrolls().length).toBe(calls + 1); // to Gen VIII; IX has no entry; then none
    // The carousel jumps (no sweep) when it wraps around.
    const trackScrolls = scrollTo.mock.calls.filter((_, i) => scrollTo.mock.contexts[i] !== region);
    expect(trackScrolls.at(-1)?.[0]).toMatchObject({ behavior: "smooth" });
    await user.click(screen.getByRole("button", { name: "Next sprite" }));
    expect(label(container)).toBe("Gen I");
    expect(scrollTo.mock.calls.filter((_, i) => scrollTo.mock.contexts[i] !== region).at(-1)?.[0]).toMatchObject({
      left: 0,
      behavior: "instant",
    });
    delete (Element.prototype as Partial<Element>).scrollTo;
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
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(label(container)).toBe("Animated");
    await user.keyboard("{Enter}");
    expect(container.querySelector(".art")!.classList.contains("flipped")).toBe(false);
    expect(document.activeElement).toBe(front);
  });

  it("a species with one generation of sprites has no paging", async () => {
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

  it("every listed back sprite and menu icon exists on disk", () => {
    for (const s of dataset.species) {
      const paths = [
        ...(s.backSprites ?? []).map((g) => backSpritePath(g, s.id)),
        ...(s.icons ?? []).map((g) => iconPath(g, s.id)),
      ];
      for (const p of paths) expect(existsSync(path.resolve(process.cwd(), "public", p)), p).toBe(true);
    }
    expect(byName("Pikachu").backSprites).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(byName("Pikachu").icons).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("each species' first sprite is from the generation it premiered in", () => {
    // Known gap: PokéAPI's Ultra Sun / Ultra Moon sprites stop at #802, so the
    // Pokémon added after Sun / Moon (#803–809) open on their Gen VIII sprite.
    const off = dataset.species.filter((s) => s.sprites?.length && s.sprites[0] !== s.generation);
    expect(off.map((s) => s.id)).toEqual([803, 804, 805, 806, 807, 808, 809]);
  });

  it("no species lists a sprite or icon from before it existed", () => {
    for (const s of dataset.species) {
      for (const gens of [s.sprites, s.backSprites, s.icons]) {
        expect(gens?.every((g) => g >= s.generation), s.name).toBe(true);
      }
    }
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
