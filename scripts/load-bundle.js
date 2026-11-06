#!/usr/bin/env node
// Load a bundle straight into the database, without the browser.
//
//   npm run load -- ./depict-annotation-bundle.json
import fs from "node:fs";
import { db } from "../server/db.js";
import { prepareBundle } from "../server/lib/bundle.js";
import { mergePrepared } from "../server/lib/corpus.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run load -- ./bundle.json");
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
const prepared = prepareBundle(bundle);
if (prepared.error) {
  if (prepared.error === "bad_schema") {
    console.error(`Expected schema ${prepared.expected}, got ${prepared.got}`);
  } else if (prepared.error === "would_leak") {
    console.error(prepared.detail);
  } else if (prepared.error === "instance_without_id") {
    console.error("Instance without id");
  } else {
    console.error(prepared.error === "no_instances" ? "Bundle has no instances" : prepared.error);
  }
  process.exit(1);
}

const out = mergePrepared(db, prepared.prepared);
const where = out.project ? ` for ${out.project}` : "";
console.log(
  `Loaded ${out.loaded} instances${where} (${out.inserted} new, ${out.updated} updated` +
    (out.removed ? `, ${out.removed} previous rows of that project removed` : "") +
    `). Corpus is now ${out.total} (${out.blind} blind).`
);
