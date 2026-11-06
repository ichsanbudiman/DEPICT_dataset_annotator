// The dataset: every instance resolved by the rule in lib/resolve.js.
//
// Computed here rather than in the browser so the file does not depend on
// who happened to have the page open, and so it can be fetched by a script
// at the end of the study.
import { Router } from "express";
import { db } from "../db.js";
import { requireOwner } from "../auth.js";
import { resolveInstance } from "../lib/resolve.js";

export const dataset = Router();

dataset.get("/", requireOwner, (req, res) => {
  const instances = db.prepare("SELECT id, body FROM instances ORDER BY ord").all();
  const recs = db.prepare("SELECT annotator_id, instance_id, body FROM records").all();
  const fins = db.prepare("SELECT instance_id, body FROM final").all();

  const byInstance = new Map();
  for (const r of recs) {
    const parsed = JSON.parse(r.body);
    if (!parsed.submitted) continue;                  // drafts are not evidence
    if (!byInstance.has(r.instance_id)) byInstance.set(r.instance_id, []);
    byInstance.get(r.instance_id).push({ annotator: r.annotator_id, ...parsed });
  }
  const finals = new Map(fins.map((f) => [f.instance_id, JSON.parse(f.body)]));

  const final = instances.map(({ id }) =>
    resolveInstance(id, byInstance.get(id) || [], finals.get(id)));

  res.json({
    exported: new Date().toISOString(),
    rule: "agreed | adjudicated | single | open; unsure is a verdict, " +
          "disagreement is never resolved by majority",
    instances: instances.map((r) => {
      const b = JSON.parse(r.body);
      return {
        id: r.id, root: b.root, project: b.project,
        hops: b.hops ?? null, neighbourhood: b.neighbourhood || null,
        blind: !!b.blind, proposed: b.proposed || []
      };
    }),
    records: recs.map((r) => ({ annotator: r.annotator_id, instance: r.instance_id,
                                ...JSON.parse(r.body) })),
    adjudications: fins.map((f) => ({ instance: f.instance_id, ...JSON.parse(f.body) })),
    final
  });
});
