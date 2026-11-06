
function currentRows() {
  const own = Array.from(mine, ([k, v]) =>
    Object.assign({ annotator: uid || "me", instance: k }, v));
  if (!isOwner) return own;
  const seen = new Set(own.map(r => r.annotator + "\u0000" + r.instance));
  return own.concat(allRecords.filter(r => !seen.has(r.annotator + "\u0000" + r.instance)));
}

function renderReview() {
  if (identityKnown && !isOwner) return;

  const rows = currentRows();
  const done = rows.filter(isEvidence);
  const annotators = Array.from(new Set(done.map(r => r.annotator)));

  // instance -> annotator -> labels
  const byInst = new Map();
  done.forEach(r => {
    if (!byInst.has(r.instance)) byInst.set(r.instance, new Map());
    byInst.get(r.instance).set(r.annotator, r.labels || {});
  });
  const doubled = Array.from(byInst.entries()).filter(([, m]) => m.size >= 2);

  const tiles = $("rev-tiles"); tiles.textContent = "";
  const tile = (k, v, s) => {
    const t = el("div", "tile");
    t.append(el("div", "k", k), el("div", "v tnum", v), el("div", "s", s));
    tiles.append(t);
  };
  const INST = instancesNow();
  tile("Instances", String(INST.length), INST.filter(i => i.blind).length + " marked blind");
  tile("Annotators", String(annotators.length), isOwner ? "across the shared store" : "your own records only");
  const partial = rows.length - done.length;
  tile("Completed", String(done.length),
       partial ? partial + " started · all five decisions are needed"
               : "all five decisions made");
  tile("Doubly annotated", String(doubled.length), doubled.length ? "usable for agreement" : "two annotators needed");

  // ---- agreement ---------------------------------------------------
  const pairsOf = (m) => {
    const a = Array.from(m.keys()), out = [];
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) out.push([a[i], a[j], m.get(a[i]), m.get(a[j])]);
    return out;
  };
  const allPairs = [];
  doubled.forEach(([inst, m]) => pairsOf(m).forEach(p => allPairs.push([inst].concat(p))));
  const pairKeys = Array.from(new Set(allPairs.map(p => p[1] + "\u0000" + p[2])));

  // PABAK stays out of the table until it should be shown again.
  const showPabak = false;
  const kt = $("kappa-tbl").querySelector("tbody"); kt.textContent = "";
  const head = el("tr");
  const headers = ["Pattern", "Yes rate", "Unsure", "n", "pₒ", "κ"];
  if (showPabak) headers.push("PABAK");
  headers.forEach((h, i) => head.append(el("th", i > 0 ? "num" : null, h)));
  kt.append(head);

  const kappaOf = (cells) => {
    let a = 0, b = 0, c = 0, d = 0;
    cells.forEach(([x, y]) => {
      if (x === "yes" && y === "yes") a++;
      else if (x === "yes" && y === "no") b++;
      else if (x === "no" && y === "yes") c++;
      else if (x === "no" && y === "no") d++;
    });
    const n = a + b + c + d;
    if (!n) return null;
    const po = (a + d) / n;
    const pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n);
    return { n: n, po: po, k: pe === 1 ? 1 : (po - pe) / (1 - pe), pabak: 2 * po - 1,
             yes: (2 * a + b + c) / (2 * n) };
  };

  PATTERNS.forEach(([name]) => {
    // every verdict anyone gave, for the yes and unsure rates
    let seen = 0, unsure = 0, yes = 0;
    done.forEach(r => {
      const v = (r.labels || {})[name];
      if (!v) return;
      seen++;
      if (v === "unsure") unsure++; else if (v === "yes") yes++;
    });

    // per annotator pair, then averaged
    const per = [];
    pairKeys.forEach(pk => {
      const cells = allPairs
        .filter(p => p[1] + "\u0000" + p[2] === pk)
        .map(p => [p[3][name], p[4][name]])
        .filter(([x, y]) => x && y && x !== "unsure" && y !== "unsure");
      const r = kappaOf(cells);
      if (r) per.push(r);
    });

    const tr = el("tr");
    tr.append(el("td", null, name));
    tr.append(el("td", "num tnum", seen ? (yes / (seen - unsure || 1)).toFixed(2) : "—"));
    tr.append(el("td", "num tnum", seen ? (unsure / seen).toFixed(2) : "—"));
    if (!per.length) {
      for (let i = 3; i < headers.length; i++) tr.append(el("td", "num", "—"));
      kt.append(tr); return;
    }
    const n = per.reduce((s, r) => s + r.n, 0);
    const mean = (f) => per.reduce((s, r) => s + f(r), 0) / per.length;
    tr.append(el("td", "num tnum", String(n)));
    tr.append(el("td", "num tnum", mean(r => r.po).toFixed(3)));
    const kcell = el("td", "num tnum", mean(r => r.k).toFixed(3));
    if (mean(r => r.pabak) - mean(r => r.k) > 0.2) kcell.className += " warnnum";
    tr.append(kcell);
    if (showPabak) tr.append(el("td", "num tnum", mean(r => r.pabak).toFixed(3)));
    kt.append(tr);
  });

  $("kappa-note").textContent = doubled.length
    ? ""
    : "No instance has two completed annotations yet";

  // ---- label set agreement -------------------------------------------
  const st = $("set-tbl").querySelector("tbody"); st.textContent = "";
  const sh = el("tr");
  ["Measure", "Value", "Over"].forEach((h, i) => sh.append(el("th", i ? "num" : null, h)));
  st.append(sh);

  const setOf = (labels) => new Set(PATTERNS.map(([n]) => n).filter(n => labels[n] === "yes"));
  let nPairs = 0, exact = 0, ham = 0, hamCells = 0, jacSum = 0, jacN = 0, bothEmpty = 0;
  doubled.forEach(([, m]) => {
    pairsOf(m).forEach(([, , la, lb]) => {
      const A = setOf(la), B = setOf(lb);
      nPairs++;
      const inter = Array.from(A).filter(x => B.has(x)).length;
      const union = new Set(Array.from(A).concat(Array.from(B))).size;
      if (!union) { bothEmpty++; exact++; }
      else {
        jacSum += inter / union; jacN++;
        if (inter === union) exact++;
      }
      PATTERNS.forEach(([n]) => {
        const x = la[n], y = lb[n];
        if (!x || !y) return;
        hamCells++; if (x === y) ham++;
      });
    });
  });
  const srow = (label, val, over) => {
    const tr = el("tr");
    tr.append(el("td", null, label));
    tr.append(el("td", "num tnum", val));
    tr.append(el("td", "num tnum", over));
    st.append(tr);
  };
  if (!nPairs) {
    srow("Jaccard, mean", "—", "—");
    $("set-note").textContent = "No instance has two completed annotations yet";
  } else {
    srow("Jaccard, mean", jacN ? (jacSum / jacN).toFixed(3) : "—",
         jacN + " pairs with a label");
    srow("Exact set match", (exact / nPairs).toFixed(3), nPairs + " pairs");
    srow("Hamming agreement", hamCells ? (ham / hamCells).toFixed(3) : "—",
         hamCells + " cells");
    srow("Both sets empty", String(bothEmpty), "counted as an exact match");
    $("set-note").textContent = nPairs + " annotator pairs over " + doubled.length + " instances";
  }

  // ---- proposal anchoring -------------------------------------------
  const at = $("anchor-tbl").querySelector("tbody"); at.textContent = "";
  const ah = el("tr");
  ["Pattern", "Blind", "Shown, proposed", "Shown, not proposed", "Pull"].forEach((h, i) =>
    ah.append(el("th", i > 0 ? "num" : null, h)));
  at.append(ah);

  const instById = new Map(instancesNow().map(i => [i.id, i]));
  let anyAnchor = false;
  PATTERNS.forEach(([name]) => {
    const bucket = { blind: [0, 0], prop: [0, 0], not: [0, 0] };
    done.forEach(r => {
      const v = (r.labels || {})[name];
      const inst = instById.get(r.instance);
      if (!v || v === "unsure" || !inst) return;
      const b = inst.blind ? bucket.blind
        : ((inst.proposed || []).indexOf(name) >= 0 ? bucket.prop : bucket.not);
      b[1]++; if (v === "yes") b[0]++;
    });
    const rate = (b) => b[1] ? b[0] / b[1] : null;
    const fmt = (b) => b[1] ? rate(b).toFixed(2) + " (" + b[1] + ")" : "—";
    const tr = el("tr");
    tr.append(el("td", null, name));
    tr.append(el("td", "num tnum", fmt(bucket.blind)));
    tr.append(el("td", "num tnum", fmt(bucket.prop)));
    tr.append(el("td", "num tnum", fmt(bucket.not)));
    const rp = rate(bucket.prop), rn = rate(bucket.not);
    if (rp !== null && rn !== null) {
      anyAnchor = true;
      tr.append(el("td", "num tnum", (rp - rn).toFixed(2)));
    } else tr.append(el("td", "num", "—"));
    at.append(tr);
  });
  $("anchor-note").textContent = anyAnchor
    ? "Yes rate per condition, with the number of verdicts behind it"
    : "Needs completed verdicts on both blind and shown instances";
  $("anchor-prose").textContent =
    "A large pull with the blind rate sitting between the two shown rates is the "
    + "signature of anchoring. This is a proxy: the bundle withholds proposals on "
    + "blind instances, so the direct test, whether a verdict matches what the rules "
    + "proposed, has to be run outside the app by joining the export to the "
    + "generator's own proposal list. The comparison also assumes the blind split was "
    + "random, which is what blind_seed records.";

  // ---- adjudication --------------------------------------------------
  const dt = $("dis-tbl").querySelector("tbody"); dt.textContent = "";
  const dh = el("tr");
  ["Instance", "Pattern", "Verdicts", "Resolved"].forEach((h, i) =>
    dh.append(el("th", i === 3 ? "num" : null, h)));
  dt.append(dh);

  let open = 0, shown = 0, resolved = 0;
  doubled.forEach(([instId, m]) => {
    const vs = Array.from(m.entries());
    PATTERNS.forEach(([name]) => {
      const set = new Set(vs.map(([, l]) => l[name]).filter(Boolean));
      // Disputed, or unanimously undecided: both need you.
      if (set.size < 2 && !set.has("unsure")) return;
      if (!set.size) return;
      const fin = (finalsNow().get(instId) || {}).labels || {};
      const cur = fin[name] || null;
      if (cur) resolved++; else open++;
      if (++shown > 60) return;
      const inst = instById.get(instId);
      const tr = el("tr");
      // Adjudicating from two verdicts alone is guessing, so the name
      // opens the instance in Annotate with the evidence on screen.
      const open1 = el("td");
      const lk = el("button", "linkish", (inst && inst.root) || instId);
      lk.addEventListener("click", () => {
        const at = instances.findIndex(i => i.id === instId);
        if (at >= 0) { cursor = at; selected = null; hotEdge = -1; }
        // Carry the pattern across, not just the instance: the question is
        // "is this a Factory", and Annotate should open on that question.
        adjudicating = { instance: instId, pattern: name };
        adjSeek = true;
        $("tab-ann").click();
        render();
        window.scrollTo(0, 0);
      });
      open1.append(lk);
      tr.append(open1);
      tr.append(el("td", null, name));
      tr.append(el("td", null, vs.map(([a, l]) => (l[name] || "—")).join(" vs ")));
      const cell = el("td", "num");
      const seg = el("div", "seg seg-sm");
      [["yes", "Yes"], ["no", "No"]].forEach(([val, label]) => {
        const bt = el("button", null, label);
        bt.dataset.v = val;
        bt.setAttribute("aria-pressed", cur === val ? "true" : "false");
        bt.disabled = !isOwner;
        bt.addEventListener("click", () => saveFinal(instId, name, cur === val ? null : val));
        seg.append(bt);
      });
      cell.append(seg);
      tr.append(cell);
      dt.append(tr);
    });
  });
  const res = resolveAll(done);
  const full = Array.from(res.values()).filter(r => r.complete).length;
  tile("Resolved instances", String(full),
       open ? open + " cells still open" : "every cell has a label");
  $("dis-note").textContent = !shown ? "None yet"
    : (open + " open, " + resolved + " resolved" + (shown > 60 ? " (first 60 shown)" : ""))
      + (isOwner ? "" : " · only the owner can resolve");

  if (!$("export-btn") && downloads) {
    const f = el("div", "foot");
    const b = el("button", "btn", "Export annotations (JSON)"); b.id = "export-btn";
    b.addEventListener("click", () => {
      const liveRows = currentRows();
      const liveDone = liveRows.filter(isEvidence);
      const resolved = resolveAll(liveDone);
      const payload = {
        exported: new Date().toISOString(),
        rule: "agreed | adjudicated | single | open; unsure is a verdict, "
            + "disagreement is never resolved by majority",
        instances: instancesNow().map(i => ({ id: i.id, root: i.root, project: i.project,
          hops: i.hops != null ? i.hops : null, neighbourhood: i.neighbourhood || null,
          blind: !!i.blind, proposed: i.proposed || [] })),
        records: liveRows,
        adjudications: Array.from(finalsNow(), ([k, v]) => Object.assign({ instance: k }, v)),
        final: Array.from(resolved, ([k, v]) => Object.assign({ instance: k }, v))
      };
      downloads.save({ filename: "depict-annotations.json", data: JSON.stringify(payload, null, 2) }).catch(() => {});
    });
    f.append(b);
    $("dis-tbl").parentNode.parentNode.append(f);
  }
}

function closeHelp(id, openerId) {
  const dlg = $(id);
  if (!dlg || dlg.hidden) return;
  dlg.hidden = true;
  const opener = $(openerId);
  if (opener) opener.focus();
}

function openHelp(id) {
  const dlg = $(id);
  if (!dlg) return;
  document.body.append(dlg);
  dlg.hidden = false;
  const body = dlg.querySelector(".help-body");
  if (body) body.scrollTop = 0;
  const close = dlg.querySelector("[data-close]");
  if (close) close.focus({ preventScroll: true });
}

function closeKappaHelp() { closeHelp("kappa-help-dlg", "kappa-help"); }
function openKappaHelp() {
  closeSetHelp();
  openHelp("kappa-help-dlg");
}
function closeSetHelp() { closeHelp("set-help-dlg", "set-help"); }
function openSetHelp() {
  closeKappaHelp();
  openHelp("set-help-dlg");
}

function bindHelp(openId, dlgId, openFn, closeFn) {
  if (!$(openId) || !$(dlgId)) return;
  $(openId).addEventListener("click", openFn);
  const dlg = $(dlgId);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeFn(); });
  dlg.querySelector("[data-close]").addEventListener("click", closeFn);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dlg.hidden) closeFn();
  });
}

bindHelp("kappa-help", "kappa-help-dlg", openKappaHelp, closeKappaHelp);
bindHelp("set-help", "set-help-dlg", openSetHelp, closeSetHelp);

