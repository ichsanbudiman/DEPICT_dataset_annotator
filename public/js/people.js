// ---- people (self-hosted only) ------------------------------------
function renderPeople() {
  const host = $("ppl-tbl");
  if (!host || !window.DESK_ADMIN || !isOwner) return;
  const tb = host.querySelector("tbody");

  window.DESK_ADMIN.list().then(d => {
    const rows = (d && d.docs) || [];
    tb.textContent = "";
    const head = el("tr");
    ["Name", "Role", "Records", "Done", "Status", "Last seen", ""].forEach((h, i) =>
      head.append(el("th", i >= 2 && i <= 3 ? "num" : null, h)));
    tb.append(head);

    rows.forEach(r => {
      const tr = el("tr");
      tr.append(el("td", null, r.name));
      tr.append(el("td", null, r.role));
      tr.append(el("td", "num tnum", String(r.records)));
      tr.append(el("td", "num tnum", String(r.completed != null ? r.completed : "—")));
      const st = el("td");
      st.append(el("span", r.disabled ? "chip warn" : "chip", r.disabled ? "disabled" : "active"));
      tr.append(st);
      tr.append(el("td", null, r.last_seen_at
        ? r.last_seen_at.slice(0, 16).replace("T", " ") : "never"));

      const act = el("td");
      const bar = el("div", "ppl-act");
      const pend = pendingPerson && pendingPerson.id === r.id ? pendingPerson.action : null;
      if (pend) {
        // Same reason as the submit confirmation: never a browser modal.
        const q = el("span", "cb-inline", pend === "rotate"
          ? "New link now? The old one dies at once and they are signed out "
            + "everywhere. Their " + r.records + " record(s) are kept."
          : "Delete " + r.name + " and their " + r.records + " record(s)? This "
            + "cannot be undone. Rotate or Disable keeps the work.");
        bar.append(q);
        const yes = el("button", "btn" + (pend === "remove" ? " danger" : ""),
          pend === "rotate" ? "Yes, rotate" : "Yes, delete");
        yes.addEventListener("click", () => {
          pendingPerson = null;
          const op = pend === "rotate"
            ? window.DESK_ADMIN.rotate(r.id).then(showLink)
            : window.DESK_ADMIN.remove(r.id);
          op.then(renderPeople).catch(fail);
        });
        const no = el("button", "btn", "Cancel");
        no.addEventListener("click", () => { pendingPerson = null; renderPeople(); });
        bar.append(yes, no);
      } else {
        const rot = el("button", "btn", "Rotate link");
        rot.addEventListener("click", () => {
          pendingPerson = { id: r.id, action: "rotate" }; renderPeople();
        });
        bar.append(rot);

        // Disable needs no confirmation: one click puts it back.
        const tog = el("button", "btn", r.disabled ? "Enable" : "Disable");
        tog.addEventListener("click", () => {
          window.DESK_ADMIN.setDisabled(r.id, !r.disabled).then(renderPeople).catch(fail);
        });
        bar.append(tog);

        const del = el("button", "btn danger", "Remove");
        del.addEventListener("click", () => {
          pendingPerson = { id: r.id, action: "remove" }; renderPeople();
        });
        bar.append(del);
      }
      act.append(bar);
      tr.append(act);
      tb.append(tr);
    });

    $("ppl-status").textContent = rows.length
      ? rows.length + " people · " + rows.filter(x => x.disabled).length + " disabled"
      : "Nobody yet";
  }).catch(fail);

  function fail(e) {
    $("ppl-status").textContent = "Could not reach the server (" + ((e && e.code) || "error") + ")";
  }

  function showLink(x) {
    const box = $("ppl-link");
    box.textContent = "";
    box.hidden = false;
    box.className = "linkbox";
    box.append(el("div", "lk-who", x.name + " · " + x.role));
    const code = el("code", "lk-url", x.link);
    box.append(code);
    const row = el("div", "ppl-act");
    const copy = el("button", "btn", "Copy");
    copy.addEventListener("click", () => {
      navigator.clipboard && navigator.clipboard.writeText(x.link)
        .then(() => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1500); })
        .catch(() => {});
    });
    row.append(copy);
    const hide = el("button", "btn", "Hide");
    hide.addEventListener("click", () => { box.hidden = true; box.textContent = ""; });
    row.append(hide);
    box.append(row);
    box.append(el("div", "lk-note",
      "Shown once. Only its hash is stored, so this cannot be displayed again. " +
      "If it is lost, rotate the link."));
    return x;
  }
}

