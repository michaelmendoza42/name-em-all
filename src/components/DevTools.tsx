import { useCallback, useSyncExternalStore } from "react";
import type { Dataset } from "../lib/dataset";
import { groupByGeneration, romanGeneration } from "../lib/generations";
import type { ProgressStore } from "../lib/progress";

// Dev-server-only shortcuts for testing completion unlocks: each button
// completes a generation, or clears it when it's already complete. Rendered
// behind `import.meta.env.DEV`, so production builds leave it out entirely.
export function DevTools({ store, data }: { store: ProgressStore; data: Dataset }) {
  const groups = groupByGeneration(data.species);
  const ids = (species: Dataset["species"]) => species.map((s) => s.id);
  const completed = useSyncExternalStore(
    useCallback((l: () => void) => store.subscribeAll(l), [store]),
    () => groups.map((g) => (store.solvedCount(ids(g.species)) === g.species.length ? "1" : "0")).join(""),
  );
  const allDone = !completed.includes("0");
  const toggle = (done: boolean, species: Dataset["species"]) =>
    done ? store.forgetMany(ids(species)) : store.solveMany(ids(species));

  return (
    <div className="dev-tools" role="group" aria-label="Dev tools: complete or clear a generation">
      <p className="menu-note">Dev only · complete / clear a generation</p>
      <div className="dev-gens">
        {groups.map((g, i) => (
          <button
            key={g.generation}
            type="button"
            aria-pressed={completed[i] === "1"}
            title={`${completed[i] === "1" ? "Clear" : "Complete"} ${g.title}`}
            onClick={() => toggle(completed[i] === "1", g.species)}
          >
            {romanGeneration(g.generation)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={allDone}
          title={allDone ? "Clear everything" : "Complete every generation"}
          onClick={() => toggle(allDone, data.species)}
        >
          All
        </button>
      </div>
    </div>
  );
}
