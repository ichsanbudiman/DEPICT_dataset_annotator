const PATTERNS = [
  ["Adapter",  "Implements or extends a target, holds the adaptee in a field, and the method that fulfils the target calls the adaptee through that field."],
  ["Facade",   "The one interface a client uses, its methods carry out a task by calling several parts of one subsystem."],
  ["Factory",  "A method's return type is a product, and the method builds an instance of that product or of a subtype of it."],
  ["Observer", "Keeps a collection whose element type is an interface or abstract class, some method writes that collection, and some method calls the element type."],
  ["Visitor",  "Elements call a method on the visitor and pass themselves, and the visitor has a visit method for more than one element type."]
];
const VERDICTS = [["yes","Yes"],["no","No"],["unsure","Unsure"]];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

// ---- state -------------------------------------------------------
let db = null, user = null, downloads = null;
let uid = null, canWrite = null, isOwner = false;
let instances = [];            // corpus, ordered
let mine = new Map();          // instanceId -> record (this annotator)
let allRecords = [];           // owner only
let finals = new Map();        // instanceId -> { labels, by, updated }
let identityKnown = false;     // false until the user capability answers
let pendingSubmit = null;      // instance id awaiting an in-page confirm
let pendingPerson = null;      // { id, action } awaiting an in-page confirm
let adjudicating = null;       // { instance, pattern } while resolving one
let adjSeek = false;           // jump the selection to that pattern's evidence

function evidenceFor(G, pattern) {
  if (!G) return null;
  const E = G.edges.map((e, i) => Object.assign({ _i: i }, e));
  const has = (e, r) => e.rels.indexOf(r) >= 0;
  const pick = (e) => ({ node: e.from, edge: e._i });
  let e, n;
  if (pattern === "Adapter") {
    e = E.find(x => has(x, "delegates") && x.facts && x.facts.via);
    if (e) return pick(e);
    e = E.find(x => has(x, "delegates_via_field"));
    if (e) return pick(e);
  }
  if (pattern === "Observer") {
    e = E.find(x => has(x, "has_element"));
    if (e) return pick(e);
  }
  if (pattern === "Factory") {
    e = E.find(x => has(x, "creates"));
    if (e) return pick(e);
    n = G.nodes.find(x => x.kind === "method" && x.facts && x.facts.return_type &&
                          x.facts.return_type !== "void");
    if (n) return { node: n.id, edge: -1 };
  }
  if (pattern === "Facade") {
    // the member that reaches the most distinct types
    const cnt = new Map();
    E.forEach(x => {
      if (!has(x, "delegates") && !has(x, "calls")) return;
      if (!cnt.has(x.from)) cnt.set(x.from, new Set());
      cnt.get(x.from).add(x.to);
    });
    let best = null, bn = 1;
    cnt.forEach((v, k) => { if (v.size > bn) { bn = v.size; best = k; } });
    if (best) return { node: best, edge: -1 };
  }
  const root = G.nodes.find(x => x.root);
  return root ? { node: root.id, edge: -1 } : null;
}

let cursor = 0;
let selected = null, hotEdge = -1, focus = false, prunedGraph = false;
let pendingId = null;
let draftNotes = new Map();   // typed notes, written only on Submit
let draftLabels = new Map();  // clicked verdicts, written only on Submit
let corpusBusy = false;       // keep upload status from being overwritten

