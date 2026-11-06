import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS annotators (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'annotator',   -- 'annotator' | 'owner'
  created_at  TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS instances (
  id    TEXT PRIMARY KEY,
  ord   INTEGER NOT NULL,
  blind INTEGER NOT NULL DEFAULT 0,
  body  TEXT NOT NULL                              -- JSON, already sanitised
);

CREATE TABLE IF NOT EXISTS records (
  annotator_id TEXT NOT NULL REFERENCES annotators(id) ON DELETE CASCADE,
  instance_id  TEXT NOT NULL,
  body         TEXT NOT NULL,                      -- JSON { labels, note, done, ... }
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (annotator_id, instance_id)
);

CREATE TABLE IF NOT EXISTS final (
  instance_id TEXT PRIMARY KEY,
  body        TEXT NOT NULL,                       -- JSON { labels, by, updated }
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS records_instance ON records(instance_id);
`);

const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
if (!columns("annotators").includes("disabled")) {
  db.exec("ALTER TABLE annotators ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
}
if (!columns("instances").includes("updated_at")) {
  db.exec("ALTER TABLE instances ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
}
if (!columns("annotators").includes("session_epoch")) {
  db.exec("ALTER TABLE annotators ADD COLUMN session_epoch TEXT NOT NULL DEFAULT ''");
}
// Every row needs a real epoch. Rotate bumps this; cookies carry it, so an
// old session dies the moment the link is reissued.
const mintEpoch = db.prepare("UPDATE annotators SET session_epoch = ? WHERE id = ?");
for (const row of db.prepare("SELECT id FROM annotators WHERE session_epoch = ''").all()) {
  mintEpoch.run(crypto.randomBytes(16).toString("base64url"), row.id);
}

const VERSIONED = new Set(["records", "final"]);

// A cheap change token per collection, so the browser can poll without
// re-sending the whole corpus every few seconds.
export function versionOf(table) {
  if (!VERSIONED.has(table)) throw new Error(`versionOf: unknown table ${table}`);
  const row = db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS t FROM ${table}`
  ).get();
  return `${row.n}:${row.t}`;
}

export function instancesVersion() {
  const row = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS t FROM instances"
  ).get();
  return `${row.n}:${row.t}`;
}

export function newSessionEpoch() {
  return crypto.randomBytes(16).toString("base64url");
}
