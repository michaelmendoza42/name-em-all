import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ProgressStore, browserStorage } from "./lib/progress";
import "./styles.css";

const store = new ProgressStore(browserStorage());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
