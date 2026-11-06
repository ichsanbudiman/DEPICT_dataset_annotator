
function factText(v) {
  if (Array.isArray(v)) return v.map(factText).filter(Boolean).join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return v == null ? "" : String(v);
}

function labelFromId(id, kind) {
  const s = String(id);
  const body = s.indexOf(":") >= 0 ? s.slice(s.indexOf(":") + 1) : s;
  const h = body.indexOf("#");
  const base = h >= 0 ? body.slice(0, h) : body;
  const suffix = h >= 0 ? body.slice(h) : "";
  const parts = base.split(".");
  const last = parts[parts.length - 1] || base;
  return last + suffix + (kind === "method" ? "()" : "");
}

function normalizeGraph(inst) {
  const g = inst.graph;
  if (!g || !Array.isArray(g.nodes) || !g.nodes.length) return null;
  const rootId = g.root || inst.rootId || null;
  const sf = g.structural_features || {};
  const nodes = g.nodes.map(n => {
    const kind = n.kind === "field" ? "field"
      : (n.kind === "constructor" || String(n.id).startsWith("CT:") ? "constructor"
        : (n.kind === "method" ? "method" : "type"));
    const f = sf[n.id] || {};
    return {
      id: String(n.id),
      kind: kind,
      label: n.label ? String(n.label) : labelFromId(n.id, kind === "constructor" ? "method" : kind),
      qname: String(n.id).replace(/^[A-Z]+:/, ""),
      root: n.root === true || (rootId != null && n.id === rootId) || f.is_root === 1,
      source: n.source ? String(n.source) : "",
      file: n.file ? String(n.file) : "",
      lines: Array.isArray(n.lines) && n.lines.length === 2 ? [n.lines[0] | 0, n.lines[1] | 0] : null,
      hop: typeof f.hop_distance === "number" ? f.hop_distance : null,
      bidi: f.has_bidirectional_call === 1,
      // in_model_view: false means the pruning rule removed it. Absent
      // means the bundle predates the flag, so keep the node.
      inModel: n.in_model_view === false ? false : true,
      facts: n.facts && typeof n.facts === "object" ? n.facts : null
    };
  });
  const edges = (Array.isArray(g.edges) ? g.edges : []).map((e, i) => {
    const rels = Array.isArray(e.relation_type) ? e.relation_type.map(String)
      : (Array.isArray(e.rels) ? e.rels.map(String) : (e.rel ? [String(e.rel)] : []));
    return {
      _i: i,
      from: String(e.src_id != null ? e.src_id : e.from),
      to: String(e.dst_id != null ? e.dst_id : e.to),
      rels: rels.length ? rels : ["edge"],
      evidence: e.evidence ? String(e.evidence) : "",
      facts: e.facts && typeof e.facts === "object" ? e.facts : null,
      inModel: e.in_model_view === false ? false : true
    };
  });

  const own = new Set(["has_method", "has_field", "has_constructor"]);
  const carries = new Set();
  edges.forEach(e => {
    if (e.rels.every(r => own.has(r))) return;
    carries.add(e.from); carries.add(e.to);
  });
  nodes.forEach(n => {
    n.scaffold = n.kind !== "type" && !n.root && !carries.has(n.id);
  });

  return { nodes: nodes, edges: edges, byId: new Map(nodes.map(n => [n.id, n])),
           files: g.files || inst.files || null };
}

// ---- graph ---------------------------------------------------------
function layout(g) {
  const nodes = g.nodes.map(n => Object.assign({}, n));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  g.edges.forEach(e => {
    if (!byId.has(e.from) || !byId.has(e.to)) return;
    adj.get(e.from).push(e.to); adj.get(e.to).push(e.from);
  });
  const root = nodes.find(n => n.root) || nodes[0];
  if (!root) return { nodes: [], edges: [], w: 0, h: 0 };
  const depth = new Map([[root.id, 0]]);
  let frontier = [root.id];
  while (frontier.length) {
    const nxt = [];
    frontier.forEach(id => adj.get(id).forEach(j => {
      if (!depth.has(j)) { depth.set(j, Math.min(3, depth.get(id) + 1)); nxt.push(j); }
    }));
    frontier = nxt;
  }
  nodes.forEach(n => { if (!depth.has(n.id)) depth.set(n.id, 3); });

  const COLW = 186, ROWH = 34, PADX = 14, PADY = 16, MAXROWS = 13;
  const cols = [[], [], [], []];
  nodes.slice().sort((a, b) => (a.kind || "").localeCompare(b.kind || "") || String(a.label).localeCompare(String(b.label)))
    .forEach(n => cols[depth.get(n.id)].push(n));

  const tracks = [];
  cols.forEach(c => {
    if (!c.length) return;
    const n = Math.ceil(c.length / MAXROWS);
    const per = Math.ceil(c.length / n);
    for (let k = 0; k < n; k++) tracks.push(c.slice(k * per, (k + 1) * per));
  });
  let maxRows = 1;
  tracks.forEach(t => { maxRows = Math.max(maxRows, t.length); });
  tracks.forEach((t, ti) => {
    const w = t.reduce((mx, n) =>
      Math.max(mx, Math.min(150, 7 * String(n.label).length + 16)), 64);
    const off = (maxRows - t.length) / 2;
    t.forEach((n, ri) => {
      n.w = w;
      n.h = 22;
      n.x = PADX + ti * COLW;
      n.y = PADY + (off + ri) * ROWH;
    });
  });
  return {
    nodes: nodes, byId: byId,
    edges: g.edges.filter(e => byId.has(e.from) && byId.has(e.to)),
    w: PADX * 2 + Math.max(1, tracks.length) * COLW, h: PADY * 2 + maxRows * ROWH
  };
}

function renderGraph(G, inst, selId, hotIdx) {
  if (!G || !G.nodes.length) return null;
  const L = layout(G);
  const NS = "http://www.w3.org/2000/svg";
  const mk = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  const wrap = el("div", "graph-wrap");
  const svg = mk("svg", { width: L.w, height: L.h, viewBox: "0 0 " + L.w + " " + L.h, role: "img" });
  svg.setAttribute("aria-label", "Subgraph rooted at " + (inst.root || inst.id));

  const touching = new Set();
  L.edges.forEach(e => { if (e.from === selId || e.to === selId) { touching.add(e.from); touching.add(e.to); } });

  const labels = [];
  L.edges.forEach((e, i) => {
    const a = L.byId.get(e.from), b = L.byId.get(e.to);
    const inc = selId && (e.from === selId || e.to === selId);
    let d, lx, ly;
    if (e.from === e.to) {
      const x = a.x + a.w, y = a.y + a.h / 2;
      d = "M" + x + "," + (y - 5) + " C" + (x + 20) + "," + (y - 16) + " " + (x + 20) + "," + (y + 16) + " " + x + "," + (y + 5);
      lx = x + 26; ly = y - 10;
    } else if (Math.abs(a.x - b.x) < 8) {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2;
      const out = Math.max(x1, x2) + 34;
      d = "M" + x1 + "," + y1 + " C" + out + "," + y1 + " " + out + "," + y2 + " " + x2 + "," + y2;
      lx = out - 2; ly = (y1 + y2) / 2 - 4;
    } else {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
      const dx = Math.max(26, Math.abs(x2 - x1) / 2);
      d = x2 < x1
        ? "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + (y1 - 22) + " " + (x2 - dx) + "," + (y2 - 22) + " " + x2 + "," + y2
        : "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
      lx = (x1 + x2) / 2; ly = (y1 + y2) / 2 - 5;
    }
    const hot = (e._i != null ? e._i : i) === hotIdx;
    const p = mk("path", { d: d, class: "gedge" + (e.inModel === false ? " out" : "") + (inc ? " inc" : (selId ? " dim" : "")) });
    if (hot) p.setAttribute("stroke-width", "2.4");
    svg.append(p);

    if (hot) labels.push({ x: lx, y: ly, hot: true,
      text: e.rels.join(" + ") });
  });

  L.nodes.forEach(n => {
    const cls = "gnode kind-" + (n.kind || "type") + (n.root ? " is-root" : "")
      + (n.id === selId ? " sel" : "") + (selId && !touching.has(n.id) && n.id !== selId ? " dim" : "")
      + (n.inModel === false ? " out" : "");
    const grp = mk("g", { class: cls, tabindex: "0", role: "button" });
    // Shape carries the kind, and has to be visible at 22px: a type is a
    // square box, a method is softly rounded, a field is a full pill.
    const r = n.kind === "field" ? n.h / 2 : (n.kind === "method" || n.kind === "constructor" ? 5 : 0);
    grp.append(mk("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: r, ry: r }));
    const t = mk("text", { x: n.x + n.w / 2, y: n.y + n.h / 2 + 3.5, "text-anchor": "middle" });
    t.textContent = String(n.label).length > 20 ? String(n.label).slice(0, 19) + "…" : n.label;
    grp.append(t);
    const pick = () => { selected = n.id; hotEdge = -1; render(); };
    grp.addEventListener("click", pick);
    grp.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    svg.append(grp);
  });

  labels.forEach(l => {
    const w = l.text.length * 5.4 + 12, h = 15;
    const x = Math.max(2, Math.min(L.w - w - 2, l.x - w / 2));
    const y = Math.max(2, Math.min(L.h - h - 2, l.y - h + 3));
    svg.append(mk("rect", { x: x, y: y, width: w, height: h, rx: 4, ry: 4, class: "glabel-bg" }));
    const t = mk("text", { x: x + w / 2, y: y + 11, "text-anchor": "middle", class: "glabel" });
    t.textContent = l.text;
    svg.append(t);
  });

  wrap.append(svg);

  if (selId && L.byId.has(selId)) {
    const n = L.byId.get(selId);
    requestAnimationFrame(() => {
      try {
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        if (wrap.scrollWidth > wrap.clientWidth)
          wrap.scrollLeft = Math.max(0, cx - wrap.clientWidth / 2);
        if (wrap.scrollHeight > wrap.clientHeight)
          wrap.scrollTop = Math.max(0, cy - wrap.clientHeight / 2);
      } catch (err) {}
    });
  }
  return wrap;
}

function codePane(G, node, incident, hotIdx) {
  const files = G.files || {};
  const path = node.file || "";
  const whole = path && files[path] ? files[path] : null;

  if (whole && node.lines) {
    const win = typeof whole === "string" ? { from: 1, text: whole } : whole;
    const base = win.from || 1;
    const src = String(win.text).split("\n");
    const last = base + src.length - 1;

    const BIG = 30;
    const spanOf = (r) => r[1] - r[0] + 1;
    const put = (marks, r, cls) => {
      if (spanOf(r) > BIG) { setMark(marks, r[0], cls); setMark(marks, r[1], cls); }
      else for (let l = r[0]; l <= r[1]; l++) setMark(marks, l, cls);
    };
    const rank = { near: 0, sel: 1, hot: 2 };
    function setMark(marks, l, cls) {
      if (l < base || l > last) return;
      if (!marks.has(l) || rank[cls] >= rank[marks.get(l)]) marks.set(l, cls);
    }

    const marks = new Map();
    put(marks, node.lines, "sel");
    incident.forEach(e => {
      const o = G.byId.get(e.from === node.id ? e.to : e.from);
      if (!o || !o.lines || o.file !== path) return;
      const encloses = o.lines[0] <= node.lines[0] && o.lines[1] >= node.lines[1];
      const nested   = o.lines[0] >= node.lines[0] && o.lines[1] <= node.lines[1];
      if (encloses || nested) return;
      put(marks, o.lines, e._i === hotIdx ? "hot" : "near");
    });

    const PAD = 6;
    const keep = new Set();
    Array.from(marks.keys()).forEach(l => {
      for (let k = Math.max(base, l - PAD); k <= Math.min(last, l + PAD); k++) keep.add(k);
    });
    const show = Array.from(keep).sort((a, b) => a - b);

    const pre = el("pre", "src");
    let prev = null, firstSel = null;
    show.forEach(l => {
      if (prev !== null && l > prev + 1) pre.append(el("span", "gap", "… lines " + (prev + 1) + "–" + (l - 1)));
      const cls = marks.get(l);
      const row = el("span", "row" + (cls ? " " + cls : ""));
      row.append(el("span", "no", String(l)));
      row.append(document.createTextNode((src[l - base] || "") + "\n"));
      pre.append(row);
      if (!firstSel && (cls === "sel" || cls === "hot")) firstSel = row;
      prev = l;
    });
    if (show.length && show[0] > base) pre.insertBefore(el("span", "gap", "… lines " + base + "–" + (show[0] - 1)), pre.firstChild);
    if (show.length && show[show.length - 1] < last) pre.append(el("span", "gap", "… lines " + (show[show.length - 1] + 1) + "–" + last));

    // Open on the selection, not on the top of the file.
    if (firstSel) requestAnimationFrame(() => {
      try {
        const d = firstSel.getBoundingClientRect().top - pre.getBoundingClientRect().top;
        pre.scrollTop = Math.max(0, pre.scrollTop + d - 48);
      } catch (err) {}
    });
    return pre;
  }

  // No line ranges: fall back to the node's own snippet, marking any
  // substring evidence an edge carries.
  const pre = el("pre", "src");
  const src = node.source || (typeof whole === "string" ? whole : (whole && whole.text) || "");
  if (!src) {
    pre.append(document.createTextNode(
      path ? "No source for " + path + " in this bundle." : "This bundle carries topology only — no source for this node."));
    return pre;
  }
  const ms = [];
  incident.filter(e => e.from === node.id).forEach(e => {
    if (!e.evidence) return;
    const s = src.indexOf(e.evidence);
    if (s >= 0) ms.push({ s: s, e: s + e.evidence.length, hot: e._i === hotIdx });
  });
  ms.sort((a, b) => a.s - b.s);
  let at = 0;
  ms.forEach(m => {
    if (m.s < at) return;
    pre.append(document.createTextNode(src.slice(at, m.s)));
    pre.append(el("mark", m.hot ? "hot" : null, src.slice(m.s, m.e)));
    at = m.e;
  });
  pre.append(document.createTextNode(src.slice(at)));
  return pre;
}

