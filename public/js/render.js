// ---- render ------------------------------------------------------
function render() {
  const ae = document.activeElement;
  const typing = !!(ae && ae.tagName === "TEXTAREA" && ae.classList.contains("note"));
  const restore = typing
    ? { id: ae.id, start: ae.selectionStart, end: ae.selectionEnd, scroll: ae.scrollTop }
    : null;
  renderIndex();
  if (!typing) renderSubject();
  renderReview();
  const cs = $("cor-status");
  if (cs && !corpusBusy) {
    cs.textContent = instances.length ? instances.length + " instances loaded" : "No corpus loaded";
  }
  const stored = $("cor-stored");
  if (stored) {
    stored.textContent = "";
    if (!instances.length) {
      stored.append(el("p", null, "Nothing is stored yet. A dropped JSON is saved into the database, not as the original file, and it survives restarting the container."));
    } else {
      const blind = instances.filter(i => i.blind).length;
      const projects = Array.from(new Set(instances.map(i => i.project).filter(Boolean)));
      stored.append(el("p", null,
        instances.length + " instances stored"
        + (blind ? " \u00b7 " + blind + " blind" : "")
        + (projects.length ? " \u00b7 " + projects.length + " project" + (projects.length === 1 ? "" : "s") : "")
        + ". The original JSON file is not kept; browse the corpus on the Annotate tab."));
    }
  }
  if (restore) {
    const ta = document.getElementById(restore.id);
    if (ta) {
      ta.focus();
      try { ta.setSelectionRange(restore.start, restore.end); } catch (_) {}
      ta.scrollTop = restore.scroll;
    }
  }
}

function visible() {
  const q = ($("q").value || "").trim().toLowerCase();
  const openOnly = $("only-open").checked;
  return instances.filter(i => {
    if (openOnly && (mine.get(i.id) || {}).done) return false;
    if (!q) return true;
    return (i.root || "").toLowerCase().indexOf(q) >= 0
        || (i.project || "").toLowerCase().indexOf(q) >= 0
        || (i.id || "").toLowerCase().indexOf(q) >= 0;
  });
}

function renderIndex() {
  const n = instances.length;
  const done = instances.filter(i => (mine.get(i.id) || {}).done).length;
  $("idx-count").textContent = n ? done + " / " + n : "—";
  $("bar").style.width = n ? Math.round(100 * done / n) + "%" : "0%";
  $("bar-note").textContent = n
    ? (n - done) + " left · " + instances.filter(i => i.blind).length + " blind"
    : "No instances loaded yet.";

  const ol = $("index"); ol.textContent = "";
  const vis = visible();
  if (!vis.length) { ol.append(el("li", null, "")); ol.lastChild.append(el("div", "none", n ? "Nothing matches that filter." : "No instances loaded yet.")); return; }
  vis.forEach(inst => {
    const i = instances.indexOf(inst);
    const li = el("li");
    const b = el("button");
    b.setAttribute("aria-current", i === cursor ? "true" : "false");
    const d = el("span", "dot" + ((mine.get(inst.id) || {}).done ? " done" : (inst.blind ? " blind" : "")));
    const nm = el("span", "nm", inst.root || inst.id);
    b.append(d, nm);
    b.addEventListener("click", () => { cursor = i; selected = null; hotEdge = -1; render(); });
    li.append(b); ol.append(li);
  });
}

