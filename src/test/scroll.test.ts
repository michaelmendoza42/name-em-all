import { describe, expect, it } from "vitest";
import { scrollDuration } from "../lib/scroll";

describe("scrollDuration", () => {
  it("grows with distance but stays within bounds", () => {
    const short = scrollDuration(100, 800);
    const screen = scrollDuration(800, 800);
    const far = scrollDuration(80_000, 800);
    expect(short).toBeGreaterThanOrEqual(220);
    expect(screen).toBeGreaterThan(short);
    expect(far).toBe(900);
    expect(scrollDuration(-800, 800)).toBe(screen);
  });
});
