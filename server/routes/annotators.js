// Managing people. Owner only.
//
// Four ways to take a link out of circulation, in increasing severity:
//
//   rotate   a new link, same person, annotations kept   <- leaked link
//   disable  no sign-in, everything kept, reversible     <- unsure
//   enable   undo a disable
//   delete   the person and all their annotations, gone  <- last resort
//

import { Router } from "express";
import { db } from "../db.js";
import { requireOwner, createAnnotator, rotateToken, setDisabled } from "../auth.js";

export const annotators = Router();

const listQuery = db.prepare(
  `SELECT a.id, a.name, a.role, a.disabled, a.created_at, a.last_seen_at,
          (SELECT COUNT(*) FROM records r WHERE r.annotator_id = a.id) AS records,
          (SELECT COUNT(*) FROM records r WHERE r.annotator_id = a.id
             AND json_extract(r.body, '$.submitted') = 1) AS completed
   FROM annotators a ORDER BY a.created_at`
);

annotators.get("/", requireOwner, (req, res) => {
  res.set("Cache-Control", "no-store").json({ docs: listQuery.all() });
});

annotators.post("/", requireOwner, (req, res) => {
  const name = ((req.body && req.body.name) || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  if (name.length > 80) return res.status(400).json({ error: "name_too_long" });
  const role = req.body.role === "owner" ? "owner" : "annotator";
  res.json(createAnnotator({ name, role }));        // the link, shown once
});

// A fresh link. The old one stops working immediately; the work stays.
annotators.post("/:id/rotate", requireOwner, (req, res) => {
  const out = rotateToken(req.params.id);
  if (!out) return res.status(404).json({ error: "no_such_annotator" });
  res.json(out);
});

annotators.post("/:id/disabled", requireOwner, (req, res) => {
  const disabled = !!(req.body && req.body.disabled);
  if (req.params.id === req.user.id && disabled) {
    return res.status(400).json({ error: "cannot_disable_self" });
  }
  if (!setDisabled(req.params.id, disabled)) {
    return res.status(404).json({ error: "no_such_annotator" });
  }
  res.json({ ok: true, disabled });
});

annotators.delete("/:id", requireOwner, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "cannot_remove_self" });
  if (req.query.confirm !== "delete-their-annotations") {
    return res.status(400).json({
      error: "confirm_required",
      hint: "append ?confirm=delete-their-annotations — rotate or disable instead if you want to keep the work"
    });
  }
  const n = db.prepare("SELECT COUNT(*) AS n FROM records WHERE annotator_id = ?")
    .get(req.params.id).n;
  const info = db.prepare("DELETE FROM annotators WHERE id = ?").run(req.params.id);
  res.json({ removed: info.changes, annotationsDestroyed: n });
});
