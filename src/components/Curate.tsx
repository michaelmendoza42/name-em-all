import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fromGroups,
  gather,
  type Group,
  type ItemTarget,
  kinNeighbours,
  moveGroup,
  moveItems,
  OPENING,
  toGroups,
} from "../lib/curate";
import "./curate.css";

// Dev-only page (/curate) for arranging Hard Mode's wall by hand: the round
// opening, then every lookalike group in order. Silhouettes only, no names.
// Drag a silhouette within or across groups, or into a gap for a new group;
// drag a group's handle to move the group. Click to select several and drag
// them together. Saving writes scripts/lookalikes/curated.json, which is
// canonical, and republishes public/lookalikes.json from it.
//
// The side panel lists suggestion themes (scripts/lookalikes/themes.json):
// sets that are confusing together. Hover one to see where its members sit;
// drag a member out, or Gather the whole set into a new group.

const BASE = import.meta.env.BASE_URL;
const ENDPOINT = "/__curate";

type Drag = { kind: "items"; ids: number[] } | { kind: "group"; key: string };
// Where a drop would land, and what to mark while hovering it.
type Hover =
  | { kind: "item"; target: ItemTarget; mark: { id: number; side: "before" | "after" } | { end: string } }
  | { kind: "gap"; before: string | null };

type Status = { tone: "info" | "ok" | "warn" | "error"; text: string };

interface Theme {
  key: string;
  label: string; // describes the theme, never a species
  source: "data" | "shape" | "hand";
  ids: number[];
}

const SOURCES: [Theme["source"], string][] = [
  ["shape", "By silhouette"],
  ["hand", "Hand-picked"],
  ["data", "By category"],
];

export function Curate() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [chains, setChains] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Group[][]>([]);
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<Hover | null>(null);
  // The same, for drop: a drop can land before the last hover re-renders.
  const hoverRef = useRef<Hover | null>(null);
  const [status, setStatus] = useState<Status>({ tone: "info", text: "Loading…" });
  const [saving, setSaving] = useState(false);
  const drag = useRef<Drag | null>(null);
  // What's being dragged, for the gaps' labels (the ref doesn't re-render).
  const [dragging, setDragging] = useState<Drag["kind"] | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  // Members of the theme under the pointer, outlined on the board.
  const [spot, setSpot] = useState<Set<number> | null>(null);

  useEffect(() => {
    fetch(ENDPOINT)
      .then((res) => res.json())
      .then(({ arrangement, chains, themes, error }) => {
        if (error) throw new Error(error);
        setThemes(themes ?? []);
        const next = toGroups(arrangement.round, arrangement.runs);
        setGroups(next);
        setChains(chains);
        setSaved(JSON.stringify(fromGroups(next)));
        setStatus({ tone: "info", text: "Drag to arrange. Click to select several." });
      })
      .catch((err: Error) =>
        setStatus({ tone: "error", text: `Couldn't load (${err.message}). Is this the dev server?` }),
      );
  }, []);

  const current = groups ? JSON.stringify(fromGroups(groups)) : "";
  const dirty = groups !== null && current !== saved;
  const kin = useMemo(() => (groups ? kinNeighbours(groups, chains) : new Set<number>()), [groups, chains]);

  const change = useCallback((next: Group[]) => {
    setGroups((prev) => {
      if (prev) setHistory((h) => [...h.slice(-99), prev]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setGroups(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  const save = useCallback(async () => {
    if (!groups) return;
    setSaving(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fromGroups(groups)),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSaved(JSON.stringify({ round: result.round, runs: result.runs }));
      setStatus(
        result.published
          ? { tone: "ok", text: "Saved and published. Hard Mode uses this order now." }
          : {
              tone: "warn",
              text: `Saved, not published: ${result.kin.length} pair${result.kin.length === 1 ? "" : "s"} of relatives side by side (outlined in red).`,
            },
      );
    } catch (err) {
      setStatus({ tone: "error", text: `Save failed: ${(err as Error).message}` });
    } finally {
      setSaving(false);
    }
  }, [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") setSelected(new Set());
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [undo, save, dirty]);

  if (!groups)
    return (
      <main className="curate">
        <p className={`curate-status ${status.tone}`}>{status.text}</p>
      </main>
    );

  const order = groups.flatMap((g) => g.ids);
  const startItems = (e: DragEvent, id: number) => {
    // Dragging a selected silhouette takes the whole selection, in wall order.
    const ids = selected.has(id) ? order.filter((x) => selected.has(x)) : [id];
    drag.current = { kind: "items", ids };
    setDragging("items");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  };
  const startGroup = (e: DragEvent, key: string) => {
    drag.current = { kind: "group", key };
    setDragging("group");
    setDragged(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  };
  const over = (e: DragEvent, next: Hover) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    hoverRef.current = next;
    if (JSON.stringify(next) !== JSON.stringify(hover)) setHover(next);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag.current;
    const hover = hoverRef.current;
    if (d && hover) {
      if (d.kind === "items" && hover.kind === "item") change(moveItems(groups, d.ids, hover.target));
      else if (d.kind === "items" && hover.kind === "gap")
        change(moveItems(groups, d.ids, { newGroupBefore: hover.before }));
      else if (d.kind === "group" && hover.kind === "gap") change(moveGroup(groups, d.key, hover.before));
      if (d.kind === "items" && d.ids.length > 1) setSelected(new Set());
    }
    drag.current = null;
    hoverRef.current = null;
    setDragging(null);
    setHover(null);
  };
  const end = () => {
    drag.current = null;
    hoverRef.current = null;
    setDragging(null);
    setHover(null);
  };

  // Where each silhouette is: its group, and its place in the whole wall.
  const groupOf = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.key] as const)));
  const place = new Map(order.map((id, i) => [id, i]));
  const locate = (id: number) =>
    document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const gap = (before: string | null) => (
    <div
      className={`curate-gap${hover?.kind === "gap" && hover.before === before ? " active" : ""}`}
      onDragOver={(e) => over(e, { kind: "gap", before })}
      onDrop={drop}
      title={dragging === "group" ? "Move group here" : "New group here"}
    />
  );

  return (
    <main className={`curate${dragging ? " dragging" : ""}`} onDragEnd={end}>
      <header className="curate-bar">
        <h1>Curate Hard Mode</h1>
        <p className="curate-meta">
          {groups.length - 1} groups · {order.length} silhouettes
          {selected.size > 0 && ` · ${selected.size} selected (Esc clears)`}
          {kin.size > 0 && <span className="curate-kin"> · {kin.size} beside a relative</span>}
        </p>
        <div className="curate-actions">
          <button type="button" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={!dirty || saving}
            title="Save (Ctrl+S)"
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
        <p className={`curate-status ${status.tone}`} role="status">
          {status.text}
        </p>
      </header>

      <div className="curate-layout">
        <div className="curate-board">
          {groups.map((g, i) => (
            <div key={g.key} className="curate-slot">
              {i > 0 && gap(g.key)}
              <section
                className={`curate-group${g.key === OPENING ? " opening" : ""}${dragging === "group" && dragged === g.key ? " lifted" : ""}`}
                // A dragged group can drop anywhere on another group: its left
                // half puts it before that group, its right half after.
                onDragOver={(e) => {
                  if (drag.current?.kind !== "group") return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const after = g.key === OPENING || e.clientX > r.left + r.width / 2;
                  over(e, { kind: "gap", before: after ? (groups[i + 1]?.key ?? null) : g.key });
                }}
                onDrop={drop}
              >
                <h2 draggable={g.key !== OPENING} onDragStart={(e) => startGroup(e, g.key)}>
                  {g.key !== OPENING && (
                    <span className="curate-handle" aria-hidden="true">
                      ⠿
                    </span>
                  )}
                  {g.key === OPENING ? "Opening · always first" : i}
                  <span className="curate-count">{g.ids.length}</span>
                </h2>
                <div
                  className={`curate-items${hover?.kind === "item" && "end" in hover.mark && hover.mark.end === g.key ? " drop-end" : ""}`}
                  onDragOver={(e) =>
                    drag.current?.kind === "items" &&
                    over(e, { kind: "item", target: { group: g.key }, mark: { end: g.key } })
                  }
                  onDrop={drop}
                >
                  {g.ids.map((id, k) => {
                    const mark =
                      hover?.kind === "item" && "id" in hover.mark && hover.mark.id === id ? hover.mark.side : "";
                    return (
                      <div
                        key={id}
                        className={[
                          "curate-item",
                          selected.has(id) && "selected",
                          kin.has(id) && "kin",
                          mark && `drop-${mark}`,
                          spot?.has(id) && "spot",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-id={id}
                        draggable
                        onDragStart={(e) => startItems(e, id)}
                        onDragOver={(e) => {
                          if (drag.current?.kind !== "items") return;
                          const r = e.currentTarget.getBoundingClientRect();
                          const after = e.clientX > r.left + r.width / 2;
                          const before = after ? g.ids[k + 1] : id;
                          over(e, {
                            kind: "item",
                            target: { group: g.key, before },
                            mark: { id, side: after ? "after" : "before" },
                          });
                        }}
                        onDrop={drop}
                        onClick={() =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (!next.delete(id)) next.add(id);
                            return next;
                          })
                        }
                      >
                        <img src={`${BASE}sil/${id}.webp`} alt="" draggable={false} loading="lazy" />
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ))}
          {gap(null)}
        </div>

        <aside className="curate-themes" aria-label="Suggestions">
          <h2>Suggestions</h2>
          <p className="curate-hint">
            Hover a theme to outline its members. Drag one out, or Gather the set into a new group.
          </p>
          {SOURCES.map(([source, heading]) => (
            <section key={source}>
              <h3>{heading}</h3>
              {themes
                .filter((t) => t.source === source)
                .map((t) => {
                  const ids = t.ids.filter((id) => place.has(id)).sort((a, b) => place.get(a)! - place.get(b)!);
                  const together = new Set(ids.map((id) => groupOf.get(id))).size === 1;
                  return (
                    <details
                      key={t.key}
                      className="curate-theme"
                      onMouseEnter={() => setSpot(new Set(ids))}
                      onMouseLeave={() => setSpot(null)}
                    >
                      <summary>
                        <span className="curate-theme-label">{t.label}</span>
                        <span className="curate-count">{ids.length}</span>
                        {together && (
                          <span className="curate-together" title="All in one group">
                            ✓
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            change(gather(groups, ids, chains));
                            setStatus({ tone: "info", text: `Gathered “${t.label}” into a new group.` });
                          }}
                        >
                          Gather
                        </button>
                      </summary>
                      <div className="curate-theme-items">
                        {ids.map((id) => (
                          <div
                            key={id}
                            className={`curate-item mini${selected.has(id) ? " selected" : ""}`}
                            draggable
                            onDragStart={(e) => startItems(e, id)}
                            onClick={() => locate(id)}
                            title="Show on the board"
                          >
                            <img src={`${BASE}sil/${id}.webp`} alt="" draggable={false} loading="lazy" />
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
            </section>
          ))}
        </aside>
      </div>
    </main>
  );
}
