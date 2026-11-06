import { Router } from "express";
import { db, versionOf } from "../db.js";
import { requireOwner } from "../auth.js";
import { PATTERNS } from "../lib/resolve.js";
import { etagMatch, setEtag } from "../lib/etag.js";

export const final = Router();

final.get("/", requireOwner, (req, res) => {
  const version = versionOf("final");
  if (etagMatch(req, version)) return res.status(304).end();
  const rows = db.prepare("SELECT instance_id, body FROM final").all();
  setEtag(res, version);
  res.json({
    version,
    docs: rows.map((r) => ({ id: r.instance_id, ...JSON.parse(r.body) }))
  });
});

final.put("/:instanceId", requireOwner, (req, res) => {
  const incoming = (req.body && req.body.labels) || {};
  const labels = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (!PATTERNS.includes(k)) return res.status(400).json({ error: "unknown_pattern", pattern: k });
    if (v !== "yes" && v !== "no") return res.status(400).json({ error: "bad_verdict", value: v });
    labels[k] = v;
  }
  const body = { labels, by: req.user.id, updated: new Date().toISOString() };

  if (!Object.keys(labels).length) {
    db.prepare("DELETE FROM final WHERE instance_id = ?").run(req.params.instanceId);
    return res.json({ ok: true, cleared: true });
  }
  db.prepare(
    `INSERT INTO final (instance_id, body, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(instance_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
  ).run(req.params.instanceId, JSON.stringify(body), body.updated);
  res.json({ ok: true });
});
