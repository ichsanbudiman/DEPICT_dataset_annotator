import { Router } from "express";
import { db, versionOf } from "../db.js";
import { requireUser, requireOwner } from "../auth.js";
import { parseLabels, labelsComplete } from "../lib/resolve.js";
import { etagMatch, setEtag } from "../lib/etag.js";

export const records = Router();

const perUser = (req, res, version) => {
  const v = version + "~" + req.user.id;
  res.set("Cache-Control", "private, no-cache").set("Vary", "Cookie");
  setEtag(res, v);
  return v;
};

records.get("/mine", requireUser, (req, res) => {
  const version = perUser(req, res, versionOf("records"));
  if (etagMatch(req, version)) return res.status(304).end();
  const rows = db
    .prepare("SELECT instance_id, body FROM records WHERE annotator_id = ?")
    .all(req.user.id);
  res.json({
    version,
    docs: rows.map((r) => ({ id: r.instance_id, ...JSON.parse(r.body) }))
  });
});

records.put("/mine/:instanceId", requireUser, (req, res) => {
  const exists = db.prepare("SELECT 1 FROM instances WHERE id = ?").get(req.params.instanceId);
  if (!exists) return res.status(404).json({ error: "no_such_instance" });

  const prior = db
    .prepare("SELECT body FROM records WHERE annotator_id = ? AND instance_id = ?")
    .get(req.user.id, req.params.instanceId);
  if (prior && JSON.parse(prior.body).submitted) {
    return res.status(409).json({
      error: "record_submitted",
      hint: "the owner can unlock it with DELETE /api/records/:annotator/:instance/submitted"
    });
  }

  const b = req.body || {};
  if (!b.submitted) {
    return res.status(400).json({
      error: "submit_only",
      hint: "a record is written only when the judgment is submitted"
    });
  }
  const parsed = parseLabels(b.labels && typeof b.labels === "object" ? b.labels : {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, pattern: parsed.pattern, value: parsed.value });
  }
  const body = {
    labels: parsed.labels,
    note: typeof b.note === "string" ? b.note : "",
    done: true,
    blind: !!b.blind,
    updated: new Date().toISOString()
  };
  if (!labelsComplete(body.labels)) {
    return res.status(400).json({ error: "incomplete", hint: "decide every pattern first" });
  }
  body.submitted = true;
  body.submitted_at = typeof b.submitted_at === "string" ? b.submitted_at : body.updated;
  db.prepare(
    `INSERT INTO records (annotator_id, instance_id, body, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(annotator_id, instance_id)
     DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
  ).run(req.user.id, req.params.instanceId, JSON.stringify(body), body.updated);
  res.json({ ok: true });
});

records.get("/all", requireOwner, (req, res) => {
  const who = typeof req.query.annotator === "string" ? req.query.annotator : null;
  const version = perUser(req, res, versionOf("records") + (who ? ":" + who : ""));
  if (etagMatch(req, version)) return res.status(304).end();
  const rows = who
    ? db.prepare("SELECT annotator_id, instance_id, body FROM records WHERE annotator_id = ?").all(who)
    : db.prepare("SELECT annotator_id, instance_id, body FROM records").all();
  res.json({
    version,
    docs: rows.map((r) => ({
      id: r.instance_id,              // the app keys a record by its instance
      annotator: r.annotator_id,
      instance: r.instance_id,
      ...JSON.parse(r.body)
    }))
  });
});

records.delete("/:annotatorId/:instanceId/submitted", requireOwner, (req, res) => {
  const row = db
    .prepare("SELECT body FROM records WHERE annotator_id = ? AND instance_id = ?")
    .get(req.params.annotatorId, req.params.instanceId);
  if (!row) return res.status(404).json({ error: "no_such_record" });
  const body = JSON.parse(row.body);
  if (!body.submitted) return res.json({ ok: true, alreadyUnlocked: true });
  delete body.submitted;
  delete body.submitted_at;
  db.prepare("UPDATE records SET body = ?, updated_at = ? WHERE annotator_id = ? AND instance_id = ?")
    .run(JSON.stringify(body), new Date().toISOString(),
         req.params.annotatorId, req.params.instanceId);
  res.json({ ok: true, unlocked: true });
});
