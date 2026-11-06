import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PATTERNS, parseLabels, labelsComplete, resolveInstance
} from "../server/lib/resolve.js";

const five = Object.fromEntries(PATTERNS.map((p) => [p, "no"]));

test("parseLabels rejects unknown patterns and dummy keys", () => {
  assert.equal(parseLabels({ Adapter: "yes", Extra: "yes" }).error, "unknown_pattern");
  assert.equal(parseLabels({ Adapter: "maybe" }).error, "bad_verdict");
  assert.deepEqual(parseLabels({ Adapter: "unsure" }).labels, { Adapter: "unsure" });
  assert.equal(labelsComplete({ ...five, Adapter: undefined }), false);
  assert.equal(labelsComplete(five), true);
  assert.equal(labelsComplete({ a: 1, b: 2, c: 3, d: 4, e: 5 }), false);
});

test("unanimous unsure stays open; disagreement is not majority", () => {
  const unsure = PATTERNS.map(() => ({ labels: Object.fromEntries(PATTERNS.map((p) => [p, "unsure"])) }));
  const open = resolveInstance("i", unsure, null);
  for (const p of PATTERNS) assert.equal(open.labels[p].from, "open");

  const split = [
    { labels: { ...five, Adapter: "yes" } },
    { labels: { ...five, Adapter: "no" } },
    { labels: { ...five, Adapter: "no" } }
  ];
  const r = resolveInstance("i", split, null);
  assert.equal(r.labels.Adapter.from, "open");
  assert.equal(r.labels.Adapter.value, null);
  const adj = resolveInstance("i", split, { labels: { Adapter: "yes" }, by: "owner" });
  assert.equal(adj.labels.Adapter.from, "adjudicated");
  assert.equal(adj.labels.Adapter.value, "yes");
});
