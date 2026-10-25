import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

async function body(req: IncomingMessage): Promise<string> {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
}

// Dev-only endpoint behind the /curate page: GET returns the current
// arrangement (curated.json, else the published one) with the chain map and
// the suggestion themes (themes.json);
// POST saves an arrangement to curated.json and republishes
// public/lookalikes.json from it when it keeps the evolution rule.
function curate(): Plugin {
  return {
    name: "curate",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__curate", async (req, res) => {
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(data));
        };
        try {
          const { OUT, publish, publishedChains, readCurated, writeCurated } =
            await import("./scripts/lookalikes/publish.mjs");
          const chains = await publishedChains();
          if (req.method === "GET") {
            const published = JSON.parse(await readFile(OUT, "utf8"));
            const curated = await readCurated();
            const themes = JSON.parse(await readFile("scripts/lookalikes/themes.json", "utf8").catch(() => "[]"));
            return send(200, {
              arrangement: curated ?? { round: published.round, runs: published.runs },
              chains,
              themes,
            });
          }
          if (req.method !== "POST") return send(405, { error: "GET or POST" });
          const result = await publish(JSON.parse(await body(req)), chains, "curated");
          await writeCurated({ round: result.round, runs: result.runs });
          send(200, result);
        } catch (err) {
          send(400, { error: (err as Error).message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), curate()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    // Saving from /curate rewrites this; the page already has what it saved.
    watch: { ignored: ["**/public/lookalikes.json", "**/scripts/lookalikes/curated.json"] },
  },
  preview: { host: "0.0.0.0", allowedHosts: true },
  test: { environment: "jsdom" },
});
