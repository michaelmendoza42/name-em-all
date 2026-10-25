import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu } from "../App";
import { ProgressStore, STORAGE_KEY } from "../lib/progress";
import { MemoryStorage } from "./fixtures";

afterEach(cleanup);

function setup() {
  const storage = new MemoryStorage();
  const store = new ProgressStore(storage);
  store.solve(25);
  render(<Menu store={store} />);
  return { store, storage, user: userEvent.setup() };
}

describe("Menu", () => {
  it("hides Reset until the menu is opened", async () => {
    const { user } = setup();
    expect(screen.queryByText(/Reset progress/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("button", { name: /Reset progress/ })).toBeTruthy();
  });

  it("requires confirmation, and Cancel keeps progress", async () => {
    const { user, store } = setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: /Reset progress/ }));
    expect(store.get(25).solved).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.get(25).solved).toBe(true);
  });

  it("Erase clears all saved progress and closes the menu", async () => {
    const { user, store, storage } = setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: /Reset progress/ }));
    await user.click(screen.getByRole("button", { name: "Erase" }));
    expect(store.get(25).solved).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: "Erase" })).toBeNull();
  });

  it("Escape closes the menu", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Reset progress/)).toBeNull();
  });

  it("the Kanto oath fills in Gen 1 only after swearing", async () => {
    const { user, store } = setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: /original 151/ }));
    const swear = screen.getByRole("button", { name: /Swear/ }) as HTMLButtonElement;
    expect(swear.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /solemnly swear/ }));
    await user.click(swear);
    expect(store.get(1).solved).toBe(true);
    expect(store.get(151).solved).toBe(true);
    expect(store.get(152).solved).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("button", { name: /Fill in the original 151/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /sworn & notarized/ }));
    const box = screen.getByRole("checkbox", { name: /solemnly swear/ }) as HTMLInputElement;
    expect(box.checked && box.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Swear/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("declining the oath changes nothing", async () => {
    const { user, store } = setup();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: /original 151/ }));
    await user.click(screen.getByRole("button", { name: /decline/ }));
    expect(store.get(1).solved).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Menu in Hard Mode", () => {
  it("has no original-151 fill-in", async () => {
    render(<Menu store={new ProgressStore(new MemoryStorage(), `${STORAGE_KEY}:hard`)} mode="hard" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("button", { name: /Reset progress/ })).toBeTruthy();
    expect(screen.queryByText(/original 151/)).toBeNull();
  });
});
