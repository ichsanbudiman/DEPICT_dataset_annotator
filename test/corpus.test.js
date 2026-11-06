import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mergePrepared } from "../server/lib/corpus.js";

function open() {
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

const nutch = (id, extra = {}) => ({
  id, project: "Nutch", root: id, blind: false, ...extra
});
const jhot = (id, extra = {}) => ({
  id, project: "JHotDraw", root: id, blind: false, ...extra
});

function ids(db) {
  return db.prepare("SELECT id FROM instances ORDER BY ord, id").all().map((r) => r.id);
}

test("second project is added; first project is kept", () => {
  const db = open();
  const a = mergePrepared(db, [nutch("n1"), nutch("n2")]);
  assert.equal(a.loaded, 2);
  assert.equal(a.inserted, 2);
  assert.equal(a.updated, 0);
  assert.equal(a.removed, 0);
  assert.equal(a.project, "Nutch");
  assert.equal(a.total, 2);

  const b = mergePrepared(db, [jhot("j1")]);
  assert.equal(b.project, "JHotDraw");
  assert.equal(b.inserted, 1);
  assert.equal(b.total, 3);
  assert.deepEqual(ids(db), ["n1", "n2", "j1"]);
});

test("re-uploading a project replaces only that project", () => {
  const db = open();
  mergePrepared(db, [nutch("n1"), nutch("n2")]);
  mergePrepared(db, [jhot("j1")]);
  const out = mergePrepared(db, [nutch("n3"), nutch("n4", { blind: true })]);
  assert.equal(out.removed, 2);
  assert.equal(out.inserted, 2);
  assert.equal(out.updated, 0);
  assert.equal(out.total, 3);
  assert.equal(out.blind, 1);
  assert.deepEqual(ids(db), ["j1", "n3", "n4"]);
  const projects = db.prepare("SELECT json_extract(body, '$.project') AS p FROM instances").all().map((r) => r.p);
  assert.deepEqual(projects.sort(), ["JHotDraw", "Nutch", "Nutch"]);
});

test("re-uploading the same ids updates in place", () => {
  const db = open();
  mergePrepared(db, [nutch("n1", { root: "old" })]);
  const out = mergePrepared(db, [nutch("n1", { root: "new" })]);
  assert.equal(out.removed, 1);
  assert.equal(out.inserted, 1);
  assert.equal(out.total, 1);
  const row = db.prepare("SELECT body FROM instances WHERE id = 'n1'").get();
  assert.equal(JSON.parse(row.body).root, "new");
});

test("missing project upserts by id and does not delete others", () => {
  const db = open();
  mergePrepared(db, [nutch("n1")]);
  const out = mergePrepared(db, [{ id: "x1", root: "X" }, { id: "n1", root: "n1-updated" }]);
  assert.equal(out.project, null);
  assert.equal(out.removed, 0);
  assert.equal(out.inserted, 1);
  assert.equal(out.updated, 1);
  assert.equal(out.total, 2);
  const n1 = JSON.parse(db.prepare("SELECT body FROM instances WHERE id = 'n1'").get().body);
  assert.equal(n1.root, "n1-updated");
  assert.equal(n1.project, "Nutch"); // omitted project must not wipe the stored one
});

test("mixed projects in one file do not wipe either project", () => {
  const db = open();
  mergePrepared(db, [nutch("n1"), nutch("n2")]);
  mergePrepared(db, [jhot("j1")]);
  const out = mergePrepared(db, [nutch("n1"), jhot("j2")]);
  assert.equal(out.project, null);
  assert.equal(out.removed, 0);
  assert.equal(out.total, 4);
  assert.deepEqual(ids(db).sort(), ["j1", "j2", "n1", "n2"]);
});

test("trims project names so a padded re-upload still replaces", () => {
  const db = open();
  mergePrepared(db, [{ id: "n1", project: "  Nutch  ", root: "a" }]);
  const out = mergePrepared(db, [{ id: "n2", project: "Nutch", root: "b" }]);
  assert.equal(out.removed, 1);
  assert.equal(out.total, 1);
  assert.equal(ids(db)[0], "n2");
});
