function appendSubmitChrome(v, inst) {
  v.querySelectorAll(".subrow, .confirmbox").forEach(n => n.remove());
  const labels = labelsFor(inst.id);
  const all = PATTERNS.every(([n]) => labels[n]);
  if (pendingSubmit === inst.id && !all) pendingSubmit = null;

  if (pendingSubmit === inst.id && all) {
    const box = el("div", "confirmbox");
    box.append(el("div", "cb-h", "Submit this judgment?"));
    const list = el("div", "cb-list");
    PATTERNS.forEach(([n]) => {
      const r = el("div", "cb-row");
      r.append(el("span", "cb-n", n));
      r.append(el("b", "cb-v v-" + labels[n], labels[n]));
      list.append(r);
    });
    box.append(list);
    box.append(el("p", "cb-note",
      "Once submitted you cannot change these answers or the note. Only the "
      + "study owner can unlock it."));
    const row = el("div", "subrow");
    const yes = el("button", "btn primary", "Yes, submit");
    yes.addEventListener("click", () => {
      pendingSubmit = null;
      submitJudgment(inst.id);
    });
    const no = el("button", "btn", "Cancel");
    no.addEventListener("click", () => { pendingSubmit = null; appendSubmitChrome(v, inst); });
    row.append(yes, no);
    box.append(row);
    v.append(box);
  } else {
    const sub = el("div", "subrow");
    const btn = el("button", "btn primary", "Submit judgment");
    btn.disabled = canWrite === false || !all;
    btn.addEventListener("click", () => { pendingSubmit = inst.id; appendSubmitChrome(v, inst); });
    sub.append(btn);
    sub.append(el("span", "status", all
      ? "Nothing is stored until you submit. This locks the five answers and the note."
      : "Decide all five patterns first. Nothing is stored until you submit."));
    v.append(sub);
  }
}

function renderSubject() {
  const host = $("subject");
  const inst = current();
  host.textContent = "";
  if (!inst) {
    const e = el("div", "empty");
    e.append(el("h3", null, "Nothing to annotate yet"));
    const p = el("p", "prose", "Load a corpus bundle from the Corpus tab and the first instance opens here, with its source above and the five decisions beneath it.");
    p.style.margin = "0 auto"; e.append(p); host.append(e);
    return;
  }
  const rec = recordFor(inst.id);

  const h = el("div", "subject-h");
  h.append(el("h2", null, inst.root || inst.id));
  if (inst.project) h.append(el("span", "proj", inst.project));
  const cut = [];
  if (inst.hops != null && inst.hops !== "") {
    const n = Number(inst.hops);
    cut.push(Number.isFinite(n) ? (n === 1 ? "1 hop" : n + " hops") : String(inst.hops));
  }
  if (inst.neighbourhood) cut.push(String(inst.neighbourhood));
  if (cut.length) h.append(el("span", "chip", cut.join(" · ")));
  const sp = el("div"); sp.style.flex = "1 1 auto"; h.append(sp);
  if (rec.submitted) h.append(el("span", "chip done", "Submitted"));
  if (inst.sample) h.append(el("span", "chip sample", "Example"));
  if (inst.blind) h.append(el("span", "chip warn", "Blind — no proposals"));
  else if (Array.isArray(inst.proposed) && inst.proposed.length)
    h.append(el("span", "chip", "Rules propose: " + inst.proposed.join(", ")));
  host.append(h);

  const G = normalizeGraph(inst);

  if (adjudicating && adjudicating.instance === inst.id) {
    const pat = adjudicating.pattern;
    if (adjSeek && G) {
      const ev = evidenceFor(G, pat);
      if (ev) { selected = ev.node; hotEdge = ev.edge; }
      adjSeek = false;
    }
    const verdicts = currentRows().filter(r => r.instance === inst.id && isEvidence(r))
      .map(r => (r.labels || {})[pat]).filter(Boolean);
    const cur = ((finalsNow().get(inst.id) || {}).labels || {})[pat] || null;

    const bar = el("div", "adjbar");
    const txt = el("div", "adjtxt");
    txt.append(el("b", null, "Adjudicating " + pat));
    txt.append(document.createTextNode(
      verdicts.length ? " · judges said " + verdicts.join(" vs ") : " · no verdicts"));
    txt.append(el("span", "adjhint", "Opened on the relation this pattern turns on. Everything else is one click away."));
    bar.append(txt);

    const seg = el("div", "seg");
    [["yes", "Yes"], ["no", "No"]].forEach(([val, label]) => {
      const bt = el("button", null, label);
      bt.dataset.v = val;
      bt.setAttribute("aria-pressed", cur === val ? "true" : "false");
      bt.disabled = !isOwner;
      bt.addEventListener("click", () => saveFinal(inst.id, pat, cur === val ? null : val));
      seg.append(bt);
    });
    bar.append(seg);

    const back = el("button", "btn", "Back to review");
    back.addEventListener("click", () => {
      adjudicating = null; $("tab-rev").click(); render(); window.scrollTo(0, 0);
    });
    bar.append(back);
    host.append(bar);
  }

  if (G) {
    const rootNode = G.nodes.find(n => n.root) || G.nodes[0];
    if (!selected || !G.byId.has(selected)) { selected = rootNode.id; hotEdge = -1; }
    const sub = (keep) => {
      const ns = G.nodes.filter(n => keep.has(n.id));
      return { nodes: ns, byId: new Map(ns.map(n => [n.id, n])),
               edges: G.edges.filter(e => keep.has(e.from) && keep.has(e.to) && edgeShown(e)),
               files: G.files };
    };

    const edgeShown = (e) => !prunedGraph || e.inModel !== false || e.from === selected || e.to === selected;

    const keep = new Set([rootNode.id, selected]);
    G.nodes.forEach(n => {
      if (n.scaffold || (prunedGraph && !n.inModel)) return;
      keep.add(n.id);
    });
    let GV = sub(keep);

    if (focus && selected) {
      const near = new Set([selected, rootNode.id]);
      GV.edges.forEach(e => {
        if (e.from === selected) near.add(e.to);
        if (e.to === selected) near.add(e.from);
      });
      GV = sub(new Set(Array.from(near).filter(id => keep.has(id))));
    }
    const split = el("div", "split");
    const sl = el("div", "split-l"), sr = el("div", "split-r");
    split.append(sl, sr);
    host.append(split);

    const gw = renderGraph(GV, inst, selected, hotEdge);
    if (gw) sl.append(gw);

    const key = el("div", "gkey");
    key.append(el("span", "gkey-hint", "Click a node to read its code, click a relation to name it on the graph."));
    const meta = el("div", "gkey-meta");

    const outN = G.nodes.filter(n => !n.inModel).length;
    if (outN > 0) {
      const s = el("span");
      s.append(el("b", null, "Dashed"), document.createTextNode(" removed by pruning"));
      meta.append(s);
    }
    [["Pill", "field"], ["Rounded", "method"], ["Square", "type"]].forEach(([shape, what]) => {
      const b = el("span");
      b.append(el("b", null, shape), document.createTextNode(" " + what));
      meta.append(b);
    });

    const togs = el("div", "togs");
    const hidden = GV.nodes.length;
    const mk2 = (id, on, label, set) => {
      const fl = el("label", "toggle");
      const cb = el("input"); cb.type = "checkbox"; cb.id = id; cb.checked = on;
      cb.addEventListener("change", () => { set(cb.checked); render(); });
      fl.append(cb, document.createTextNode(label));
      togs.append(fl);
    };
    mk2("focus", focus, focus ? "Focus · " + hidden + " shown" : "Focus",
        v => { focus = v; });
    if (outN > 0) mk2("pruned", prunedGraph, "Pruned graph", v => { prunedGraph = v; });
    meta.append(togs);
    key.append(meta);
    sl.append(key);

    const node = G.byId.get(selected) || rootNode;
    const inc = G.edges.map((e, i) => Object.assign({ _i: e._i != null ? e._i : i }, e))
      .filter(e => (e.from === node.id || e.to === node.id) && edgeShown(e));

    const ch = el("div", "code-h");
    ch.append(el("span", "nm", node.label));
    ch.append(el("span", "kind", node.kind || "type"));
    if (node.hop !== null) ch.append(el("span", "kind", "hop " + node.hop));
    if (node.bidi) ch.append(el("span", "chip", "bidirectional call"));
    if (node.inModel === false) ch.append(el("span", "chip warn", "pruned"));
    if (node.scaffold) ch.append(el("span", "chip", "declared only"));
    const sp2 = el("div"); sp2.style.flex = "1 1 auto"; ch.append(sp2);
    ch.append(el("span", "qname", node.qname));
    sr.append(ch);

    if (node.file) {
      const ph = el("div", "facts");
      ph.append(el("span", "path", node.file + (node.lines ? ":" + node.lines[0] + "\u2013" + node.lines[1] : "")));
      sr.append(ph);
    }

    if (node.facts) {
      const fs = el("div", "facts");
      Object.keys(node.facts).forEach(k => {
        const txt = factText(node.facts[k]);
        if (!txt) return;
        const f = el("span", "fact");
        f.append(document.createTextNode(k.replace(/_/g, " ") + " "));
        f.append(el("b", null, txt));
        fs.append(f);
      });
      if (fs.childNodes.length) sr.append(fs);
    }

    const ownRel = (e) => e.rels.every(r =>
      r === "has_method" || r === "has_field" || r === "has_constructor");
    const chips = node.kind === "type" ? inc.filter(e => !ownRel(e)) : inc;

    if (chips.length) {
      const rs = el("div", "rels");
      chips.forEach(e => {
        const other = e.from === node.id ? e.to : e.from;
        const on = e._i === hotEdge;
        const b = el("button", "rel" + (on ? " on" : ""));
        const dir = e.from === e.to ? "\u21ba " : (e.from === node.id ? "" : "\u2190 ");
        b.append(document.createTextNode(dir + e.rels.join(" + ") + " "));
        b.append(el("i", null, (G.byId.get(other) || {}).label || other));
        if (e.facts) {
          const extra = Object.keys(e.facts)
            .filter(k => k !== "via_kind" && e.facts[k] !== null && e.facts[k] !== "")
            .map(k => k === "via" ? "via " + e.facts[k]
                    : k === "count" ? "\u00d7" + e.facts[k]
                    : k.replace(/_/g, " ") + " " + factText(e.facts[k]));
          if (extra.length) b.append(el("i", null, " \u00b7 " + extra.join(" \u00b7 ")));
        }
        b.addEventListener("click", () => { hotEdge = on ? -1 : e._i; render(); });
        rs.append(b);
      });
      sr.append(rs);
    }

    if (node.kind === "type") {
      const kids = inc.filter(e => e.from === node.id &&
        e.rels.some(r => r === "has_method" || r === "has_field" || r === "has_constructor"))
        .map(e => G.byId.get(e.to)).filter(Boolean);
      if (kids.length) {
        const ms = el("div", "members");

        kids.sort((a, b) => (a.scaffold ? 1 : 0) - (b.scaffold ? 1 : 0));
        kids.forEach(k => {
          const b = el("button", "member" + (k.scaffold ? " quiet" : ""));
          b.append(el("span", "mk", k.kind));
          b.append(el("span", "ms", (k.facts && k.facts.signature) || k.label));
          const ret = k.facts && (k.facts.return_type || k.facts.datatype);
          if (ret) b.append(el("span", "mr", String(ret)));
          if (k.inModel === false) b.append(el("span", "mr", "pruned"));
          b.addEventListener("click", () => { selected = k.id; hotEdge = -1; render(); });
          ms.append(b);
        });
        sr.append(ms);
      }
    }

    sr.append(codePane(G, node, inc, hotEdge));
  } else {
    host.append(el("pre", "src", inst.source || "(no source in the bundle)"));
  }

  if (Array.isArray(inst.context) && inst.context.length) {
    inst.context.forEach(c => {
      const d = el("details", "ctx");
      d.append(el("summary", null, c.name || "supporting type"));
      d.append(el("pre", null, c.source || ""));
      host.append(d);
    });
  }

  const v = el("div", "verdicts");
  const locked = !!rec.submitted;
  if (locked) {
    const b = el("div", "lockbar");
    b.append(el("b", null, "Submitted"));
    b.append(document.createTextNode(
      rec.submitted_at
        ? " \u00b7 " + String(rec.submitted_at).slice(0, 16).replace("T", " ")
        : ""));
    b.append(el("span", "lk-note",
      "This judgment is final and can no longer be edited. If it is wrong, ask " +
      "the study owner to unlock it."));
    v.append(b);
  }
  const labels = labelsFor(inst.id);
  PATTERNS.forEach(([name, def]) => {
    const row = el("div", "vrow");
    const nm = el("div", "vname");
    nm.append(el("b", null, name));
    if (!inst.blind && Array.isArray(inst.proposed) && inst.proposed.indexOf(name) >= 0)
      nm.append(el("span", "chip", "proposed"));
    row.append(nm);

    const seg = el("div", "seg");
    VERDICTS.forEach(([val, label]) => {
      const b = el("button", null, label);
      b.dataset.v = val;
      b.setAttribute("aria-pressed", labels[name] === val ? "true" : "false");
      b.disabled = canWrite === false || locked;
      b.addEventListener("click", () => {
        const next = Object.assign({}, labelsFor(inst.id));
        if (next[name] === val) delete next[name]; else next[name] = val;
        draftLabels.set(inst.id, next);
        PATTERNS.forEach(([pat], i) => {
          const buttons = v.querySelectorAll(".vrow")[i].querySelectorAll(".seg button");
          buttons.forEach(btn => {
            btn.setAttribute("aria-pressed", next[pat] === btn.dataset.v ? "true" : "false");
          });
        });
        appendSubmitChrome(v, inst);
      });
      seg.append(b);
    });
    row.append(seg);
    row.append(el("p", "vdef", def));
    v.append(row);
  });

  const ta = el("textarea", "note");
  ta.id = "note-" + inst.id;
  ta.placeholder = "Which example does it follow? Anything the definitions did not cover?";
  ta.value = noteFor(inst.id);
  ta.disabled = canWrite === false || locked;
  ta.addEventListener("input", () => { draftNotes.set(inst.id, ta.value); });
  v.append(ta);

  if (!locked) appendSubmitChrome(v, inst);

  host.append(v);

  const f = el("div", "foot");
  const prev = el("button", "btn", "← Previous");
  prev.disabled = cursor === 0;
  prev.addEventListener("click", () => { cursor = Math.max(0, cursor - 1); selected = null; hotEdge = -1; render(); });
  const next = el("button", "btn primary", "Next instance →");
  next.disabled = cursor >= instances.length - 1;
  next.addEventListener("click", () => { cursor = Math.min(instances.length - 1, cursor + 1); selected = null; hotEdge = -1; render(); });
  const st = el("span", "status", canWrite === false ? "Read-only access — nothing is saved" : "");
  st.id = "save-status";
  f.append(prev, next, st);
  host.append(f);
}

