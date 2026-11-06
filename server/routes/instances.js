import { Router } from "express";
import { db, instancesVersion } from "../db.js";
import { etagMatch, setEtag } from "../lib/etag.js";
import { requireUser, requireOwner } from "../auth.js";
import { forClient, assertClean } from "../lib/sanitise.js";
import { prepareBundle } from "../lib/bundle.js";
import { mergePrepared } from "../lib/corpus.js";

export const instances = Router();

instances.get("/", requireUser, (req, res) => {
  const version = instancesVersion();
  if (etagMatch(req, version)) return res.status(304).end();
  const rows = db.prepare("SELECT id, body FROM instances ORDER BY ord ASC").all();
  const docs = rows.map((r) => {
    const body = JSON.parse(r.body);
    const clean = forClient({ ...body, id: r.id });
    assertClean(clean);
    return clean;
  });
  res.set("Cache-Control", "private, no-cache").set("Vary", "Cookie");
  setEtag(res, version);
  res.json({ version, docs });
});

instances.put("/", requireOwner, (req, res) => {
  const out = prepareBundle(req.body);
  if (out.error) {
    return res.status(400).json({
      error: out.error,
      expected: out.expected,
      detail: out.detail
    });
  }
  res.json(mergePrepared(db, out.prepared));
});

instances.put("/:id", requireOwner, (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== "object") return res.status(400).json({ error: "bad_body" });
  const clean = forClient({ ...body, id: req.params.id });
  try {
    assertClean(clean);
  } catch (e) {
    return res.status(400).json({ error: "would_leak", detail: e.message });
  }
  const ord = Number.isFinite(body.ord) ? body.ord : 0;
  db.prepare(
    `INSERT INTO instances (id, ord, blind, body, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ord = excluded.ord, blind = excluded.blind,
                                   body = excluded.body, updated_at = excluded.updated_at`
  ).run(req.params.id, ord, clean.blind ? 1 : 0, JSON.stringify(clean),
        new Date().toISOString());
  res.json({ ok: true });
});

instances.delete("/", requireOwner, (req, res) => {
  if (req.query.confirm !== "empty-the-corpus") {
    return res.status(400).json({ error: "confirm_required", hint: "append ?confirm=empty-the-corpus" });
  }

  const info = db.prepare("DELETE FROM instances").run();
  const orphaned = db.prepare(
    "SELECT COUNT(*) AS n FROM records WHERE instance_id NOT IN (SELECT id FROM instances)"
  ).get().n;
  res.json({ removed: info.changes, recordsKept: orphaned });
});
