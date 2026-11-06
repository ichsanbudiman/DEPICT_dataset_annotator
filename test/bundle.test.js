import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { prepareBundle } from "../server/lib/bundle.js";
import { mergePrepared } from "../server/lib/corpus.js";

const seed = JSON.parse(fs.readFileSync(new URL("../seeds/vector-draw-1.2.json", import.meta.url), "utf8"));
const ADAPTER = "Vector Draw 1.2/src/com/vectordraw/shape/LegacyShapeAdapter.java";

function memory() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE instances (
      id TEXT PRIMARY KEY,
      ord INTEGER NOT NULL,
      blind INTEGER NOT NULL DEFAULT 0,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

test("seed bundle stamps project metadata and joins snippet windows", () => {
  const out = prepareBundle(seed);
  assert.equal(out.error, undefined);
  assert.equal(out.prepared.length, 1);
  const inst = out.prepared[0];
  assert.equal(inst.id, "vdraw-0012");
  assert.equal(inst.project, "Vector Draw 1.2");
  assert.equal(inst.hops, 1);
  assert.equal(inst.neighbourhood, "v2");
  assert.deepEqual(inst.proposed, ["Adapter"]);
  assert.deepEqual(inst.gold, {
    file_path: ADAPTER,
    project_name: "Vector Draw 1.2"
  });
  assert.equal(inst.files[ADAPTER].from, 1);
  assert.equal(inst.files[ADAPTER].to, 22);
  assert.match(inst.files[ADAPTER].text, /class LegacyShapeAdapter/);
  assert.equal(Object.keys(inst.files).length, 4);

  const cached = inst.graph.nodes.find((n) => n.id.endsWith("cachedName"));
  assert.equal(cached.in_model_view, false);
  assert.equal(inst.graph.structural_features[inst.graph.root].is_root, 1);
  const delegates = inst.graph.edges.find((e) =>
    Array.isArray(e.relation_type) && e.relation_type.includes("delegates"));
  assert.equal(delegates.facts.via, "shape");
});

test("a leaky node fact in a seed is stripped before store", () => {
  const bundle = structuredClone(seed);
  bundle.instances[0].graph.nodes[0].facts.calls_on_held_field = true;
  const out = prepareBundle(bundle);
  assert.equal(out.error, undefined);
  assert.equal(out.prepared[0].graph.nodes[0].facts.calls_on_held_field, undefined);
  assert.equal(out.prepared[0].graph.nodes[0].facts.kind, "class");
});

test("blind seed drops proposed and keeps the project stamp", () => {
  const bundle = structuredClone(seed);
  bundle.instances[0].blind = true;
  const out = prepareBundle(bundle);
  assert.equal(out.prepared[0].blind, true);
  assert.equal(Object.prototype.hasOwnProperty.call(out.prepared[0], "proposed"), false);
  assert.equal(out.prepared[0].project, "Vector Draw 1.2");
});

test("an instance project and inline files are kept when the bundle has neither", () => {
  const out = prepareBundle({
    schema: "depict_annotation_v1",
    instances: [{
      id: "old-1",
      project: "Nutch v0.4",
      root: "Fetcher",
      files: { "Fetcher.java": "class Fetcher {}" },
      graph: { nodes: [{ id: "C:Fetcher", kind: "type" }], edges: [] }
    }]
  });
  assert.equal(out.prepared[0].project, "Nutch v0.4");
  assert.equal(out.prepared[0].files["Fetcher.java"], "class Fetcher {}");
  assert.equal(out.prepared[0].hops, undefined);
});

test("re-uploading the seed project replaces only that project", () => {
  const db = memory();
  mergePrepared(db, prepareBundle(seed).prepared);
  mergePrepared(db, prepareBundle({
    schema: "depict_annotation_v1",
    project: "Other",
    instances: [{ id: "other-1", root: "Other", graph: { nodes: [{ id: "C:Other", kind: "type" }], edges: [] } }]
  }).prepared);
  const again = structuredClone(seed);
  again.instances[0].id = "vdraw-0099";
  const stats = mergePrepared(db, prepareBundle(again).prepared);
  assert.equal(stats.project, "Vector Draw 1.2");
  assert.equal(stats.removed, 1);
  const ids = db.prepare("SELECT id FROM instances ORDER BY ord").all().map((r) => r.id);
  assert.deepEqual(ids, ["other-1", "vdraw-0099"]);
});
