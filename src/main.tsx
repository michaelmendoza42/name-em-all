import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App, type Stores } from "./App";
import { MODES } from "./lib/modes";
import { ProgressStore, browserStorage } from "./lib/progress";
import "./styles.css";

// One save per mode, so each mode's solves are tracked separately.
const stores = Object.fromEntries(
  MODES.map((m) => [m.mode, new ProgressStore(browserStorage(), m.progressKey)]),
) as Stores;

// The dev server's /curate page for arranging Hard Mode by hand. Behind
// import.meta.env.DEV, so production builds leave it out entirely.
const Curate = import.meta.env.DEV
  ? lazy(() => import("./components/Curate").then((m) => ({ default: m.Curate })))
  : null;
const curating = Curate && window.location.pathname === `${import.meta.env.BASE_URL}curate`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {curating ? (
      <Suspense>
        <Curate />
      </Suspense>
    ) : (
      <App stores={stores} />
    )}
  </StrictMode>,
);
