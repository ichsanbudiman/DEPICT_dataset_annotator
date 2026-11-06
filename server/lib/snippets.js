export function pickSnippets(bundle, inst) {
  const snips = bundle.snippets || {};
  const want = {};
  for (const n of (inst.graph && inst.graph.nodes) || []) {
    if (!n.file || !Array.isArray(n.lines)) continue;
    const r = want[n.file] || (want[n.file] = [Infinity, -Infinity]);
    r[0] = Math.min(r[0], n.lines[0]);
    r[1] = Math.max(r[1], n.lines[1]);
  }
  const out = {};
  for (const w of Object.values(snips)) {
    const need = want[w.path];
    if (!need) continue;
    if (w.from <= need[0] && w.to >= need[1]) out[w.path] = w;
  }
  return out;
}
