// ---- tabs --------------------------------------------------------
function applyRole() {
  const show = isOwner || !identityKnown;
  ["tab-rev", "tab-cor"].forEach(id => { if ($(id)) $(id).hidden = !show; });
  // People exists only where a backend offers it.
  if ($("tab-ppl")) $("tab-ppl").hidden = !(show && window.DESK_ADMIN);
  if (show) { renderPeople(); return; }

  Object.keys(views).forEach(k => {
    if ($(k)) $(k).setAttribute("aria-selected", k === "tab-ann" ? "true" : "false");
    if ($(views[k])) $(views[k]).hidden = k !== "tab-ann";
  });

  ["view-rev", "view-cor", "view-ppl"].forEach(id => { if ($(id)) $(id).textContent = ""; });
}

const views = { "tab-ann": "view-ann", "tab-rev": "view-rev",
                "tab-cor": "view-cor", "tab-ppl": "view-ppl" };
Object.keys(views).forEach(t => $(t).addEventListener("click", () => {
  Object.keys(views).forEach(k => {
    $(k).setAttribute("aria-selected", k === t ? "true" : "false");
    $(views[k]).hidden = k !== t;
  });
}));

document.addEventListener("keydown", (e) => {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === "ArrowRight" && cursor < instances.length - 1) { cursor++; selected = null; hotEdge = -1; render(); }
  if (e.key === "ArrowLeft" && cursor > 0) { cursor--; selected = null; hotEdge = -1; render(); }
});
