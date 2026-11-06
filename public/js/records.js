// ---- saving ------------------------------------------------------
function current() { return instances[cursor] || null; }
function recordFor(id) { return mine.get(id) || { labels: {}, note: "", done: false }; }
function noteFor(id) {
  return draftNotes.has(id) ? draftNotes.get(id) : (recordFor(id).note || "");
}
function labelsFor(id) {
  return draftLabels.has(id) ? draftLabels.get(id) : (recordFor(id).labels || {});
}

function celebrateThanks() {
  if ($("thanks")) return;
  const quiet = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!quiet) {
    const bits = el("div", "sprinkles");
    bits.setAttribute("aria-hidden", "true");
    const colors = ["#e85d75", "#f4c95d", "#6ec4a0", "#7aa2f7", "#c084fc", "#ff8fab", "#fff4d6"];
    for (let i = 0; i < 90; i++) {
      const p = el("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.width = 6 + Math.random() * 7 + "px";
      p.style.height = 10 + Math.random() * 10 + "px";
      p.style.animationDelay = Math.random() * 0.45 + "s";
      p.style.animationDuration = 1.7 + Math.random() * 1.4 + "s";
      bits.append(p);
    }
    document.body.append(bits);
    setTimeout(() => bits.remove(), 3400);
  }
  const wrap = el("div", "thanks");
  wrap.id = "thanks";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-labelledby", "thanks-h");
  wrap.setAttribute("aria-modal", "true");
  const card = el("div", "thanks-card");
  card.append(el("h2", null, "Thank you"));
  card.lastChild.id = "thanks-h";
  card.append(el("p", null, "That was your last judgment. Thank you for your participation. This study is better because of you."));
  const ok = el("button", "btn primary", "Close");
  const close = () => wrap.remove();
  ok.addEventListener("click", close);
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  card.append(ok);
  wrap.append(card);
  document.body.append(wrap);
  ok.focus();
}

function submitJudgment(id) {
  const inst = instances.find(i => i.id === id);
  const previous = mine.get(id);
  const body = {
    labels: labelsFor(id),
    note: noteFor(id),
    done: true,
    blind: !!(inst && inst.blind),
    updated: new Date().toISOString(),
    submitted: true,
    submitted_at: new Date().toISOString()
  };
  mine.set(id, body);
  render();
  if (!db || !uid) return;
  pendingId = id;
  $("save-status") && ($("save-status").textContent = "Saving…");
  db.doc("records/" + uid).collection("items").doc(id).set(body)
    .then(() => {
      draftNotes.delete(id);
      draftLabels.delete(id);
      $("save-status") && ($("save-status").textContent = "Saved");
      const left = instances.filter(i => !(mine.get(i.id) || {}).submitted).length;
      if (instances.length && left === 0) celebrateThanks();
    })
    .catch(e => {
      const code = e && e.code;
      if (code === "invalid_argument") canWrite = false;
      const msg = code === "record_submitted"
        ? "Already submitted — this judgment is locked"
        : code === "unauthenticated"
          ? "Signed out — sign in again to save"
          : "Not saved — you may not have write access";
      $("save-status") && ($("save-status").textContent = msg);
      if (code === "record_submitted") {
        mine.set(id, Object.assign({}, previous || {}, { submitted: true }));
      } else if (previous) {
        mine.set(id, previous);
      } else {
        mine.delete(id);
      }
      render();
    });
}

function saveFinal(instId, pattern, value) {
  const cur = finalsNow().get(instId) || { labels: {} };
  const labels = Object.assign({}, cur.labels);
  if (value === null) delete labels[pattern]; else labels[pattern] = value;
  const body = { labels: labels, by: uid || "owner", updated: new Date().toISOString() };
  finalsNow().set(instId, body);
  render();
  if (!db) return;
  db.collection("final").doc(instId).set(body).catch(() => {
    $("dis-note") && ($("dis-note").textContent = "Could not save — adjudication needs edit access");
  });
}

function instancesNow() { return instances; }
function finalsNow() { return finals; }
function isEvidence(r) { return r.submitted; }

function resolveAll(done) {
  const byInst = new Map();
  done.forEach(r => {
    if (!byInst.has(r.instance)) byInst.set(r.instance, new Map());
    byInst.get(r.instance).set(r.annotator, r.labels || {});
  });
  instancesNow().forEach(i => { if (!byInst.has(i.id)) byInst.set(i.id, new Map()); });

  const out = new Map();
  byInst.forEach((m, instId) => {
    const fin = (finalsNow().get(instId) || {}).labels || {};
    const by = (finalsNow().get(instId) || {}).by || null;
    const cells = {};
    PATTERNS.forEach(([name]) => {
      const vs = Array.from(m.values()).map(l => l[name]).filter(Boolean);
      if (!vs.length) { cells[name] = { value: null, from: "missing" }; return; }
      const set = new Set(vs);
      if (set.size === 1 && !set.has("unsure")) {
        cells[name] = { value: vs[0], from: vs.length === 1 ? "single" : "agreed",
                        annotators: vs.length };
      } else if (fin[name]) {
        cells[name] = { value: fin[name], from: "adjudicated", by: by, verdicts: vs };
      } else {
        cells[name] = { value: null, from: "open", verdicts: vs };
      }
    });
    const patterns = PATTERNS.map(([n]) => n).filter(n => cells[n].value === "yes");
    const complete = PATTERNS.every(([n]) => cells[n].value !== null);
    out.set(instId, { labels: cells, patterns: patterns, complete: complete,
                      annotators: m.size });
  });
  return out;
}

