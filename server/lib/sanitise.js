
export const GOLD_KEYS = [
  "label", "labels", "gold_label", "source_csv", "csv_lines", "active_csv_lines"
];

export const LEAKY_FACTS = [
  "calls_on_held_field",
  "allocates_subtype_of_return",
  "loops_over_collection_and_calls_iface",
  "distinct_delegate_targets",
  "delegates_same_interface"
];

const SKIP_GOLD_WALK = new Set(["graph", "files"]);

function stripFacts(node) {
  if (!node || !node.facts) return node;
  const facts = {};
  for (const [k, v] of Object.entries(node.facts)) {
    if (!LEAKY_FACTS.includes(k)) facts[k] = v;
  }
  return { ...node, facts };
}

function stripGoldKeys(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripGoldKeys);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (GOLD_KEYS.includes(k)) continue;
    out[k] = SKIP_GOLD_WALK.has(k) ? v : stripGoldKeys(v);
  }
  return out;
}

function goldKeyAt(value, path = "") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = goldKeyAt(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const k of Object.keys(value)) {
    if (GOLD_KEYS.includes(k)) return path ? `${path}.${k}` : k;
    if (SKIP_GOLD_WALK.has(k)) continue;
    const hit = goldKeyAt(value[k], path ? `${path}.${k}` : k);
    if (hit) return hit;
  }
  return null;
}

export function forClient(instance) {
  const out = stripGoldKeys({ ...instance });

  if (out.gold && typeof out.gold === "object") {
    out.gold = { file_path: out.gold.file_path, project_name: out.gold.project_name };
    for (const k of Object.keys(out.gold)) if (out.gold[k] === undefined) delete out.gold[k];
  }

  if (out.blind) delete out.proposed;

  if (out.graph && Array.isArray(out.graph.nodes)) {
    out.graph = { ...out.graph, nodes: out.graph.nodes.map(stripFacts) };
  }
  return out;
}

/** Throw if an instance still carries anything it must not. */
export function assertClean(instance, { blind = instance.blind } = {}) {
  const text = JSON.stringify(instance);
  const gold = goldKeyAt(instance);
  if (gold) {
    throw new Error(`instance ${instance.id}: gold key "${gold}" present`);
  }
  for (const k of LEAKY_FACTS) {
    if (text.includes(`"${k}"`)) throw new Error(`instance ${instance.id}: leaky fact "${k}" present`);
  }
  if (blind && Object.prototype.hasOwnProperty.call(instance, "proposed")) {
    throw new Error(`instance ${instance.id}: blind instance carries "proposed"`);
  }
}
