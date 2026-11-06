// Boot: wire the middleware and the routers, serve the app, listen.
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { session, requireUser } from "./auth.js";
import { instances } from "./routes/instances.js";
import { records } from "./routes/records.js";
import { final } from "./routes/final.js";
import { me } from "./routes/me.js";
import { dataset } from "./routes/dataset.js";
import { annotators } from "./routes/annotators.js";
import { deskPage, deskScript } from "./page.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);           // behind nginx or similar
app.use(express.json({ limit: "256mb" }));  // bundles carry source
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(session);

app.get("/", requireUser, (_req, res) => {
  res.set("Cache-Control", "no-cache").type("html").send(deskPage());
});
// One script, built from public/js, so the views still share a single scope.
app.get("/assets/app.js", requireUser, (_req, res) => {
  res.set("Cache-Control", "no-cache").type("application/javascript").send(deskScript());
});
app.use("/assets", express.static(path.join(here, "..", "public"), { index: false }));

app.use("/api/me", me);
app.use("/api/instances", instances);
app.use("/api/records", records);
app.use("/api/final", final);
app.use("/api/dataset", dataset);
app.use("/api/annotators", annotators);

app.use((req, res) => res.status(404).json({ error: "not_found" }));

// One error shape, and the detail stays in the log rather than the response.
app.use((err, req, res, _next) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      error: "too_large",
      hint: "the JSON body exceeds the 256mb limit"
    });
  }
  console.error("[desk]", err);
  res.status(500).json({ error: "server_error" });
});

app.listen(config.port, () => {
  console.log(`Annotation desk on ${config.publicUrl} (port ${config.port})`);
});
