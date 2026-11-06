import { test } from "node:test";
import assert from "node:assert/strict";
import { forClient, assertClean } from "../server/lib/sanitise.js";

test("strips gold keys and leaky facts, keeps graph node labels", () => {
  const clean = forClient({
    id: "i1",
    label: "Adapter",
    gold_label: "Adapter",
    extra: { labels: { Adapter: "yes" } },
    gold: { file_path: "A.java", project_name: "p", source_csv: "secret.csv", label: "yes" },
    graph: {
      nodes: [{
        label: "WidgetFactory",
        facts: { calls_on_held_field: true, loc: 12 }
      }]
    }
  });
  assert.equal(clean.label, undefined);
  assert.equal(clean.gold_label, undefined);
  assert.equal(clean.extra.labels, undefined);
  assert.deepEqual(clean.gold, { file_path: "A.java", project_name: "p" });
  assert.equal(clean.graph.nodes[0].label, "WidgetFactory");
  assert.equal(clean.graph.nodes[0].facts.calls_on_held_field, undefined);
  assert.equal(clean.graph.nodes[0].facts.loc, 12);
  assertClean(clean);
});

test("blind instances drop proposed", () => {
  const clean = forClient({
    id: "i2",
    blind: true,
    proposed: ["Adapter"],
    graph: { nodes: [] }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(clean, "proposed"), false);
  assertClean(clean);
});

test("assertClean rejects nested gold and leftover proposed", () => {
  assert.throws(
    () => assertClean({ id: "i3", meta: { gold_label: "Visitor" } }),
    /gold_label/
  );
  assert.throws(
    () => assertClean({ id: "i4", blind: true, proposed: ["Facade"] }),
    /proposed/
  );
  assert.throws(
    () => assertClean({
      id: "i5",
      graph: { nodes: [{ facts: { delegates_same_interface: true } }] }
    }),
    /leaky fact/
  );
});
