// ---- corpus loading ----------------------------------------------
function prettyBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function setCorpusResult(kind, title, detail) {
  const box = $("cor-result");
  const cs = $("cor-status");
  if (cs) cs.textContent = title;
  if (!box) return;
  box.hidden = false;
  box.className = kind;
  box.textContent = "";
  box.append(el("b", null, title));
  if (detail) {
    box.append(document.createTextNode(" \u2014 " + detail));
  }
}

function ingestFile(f) {
  if (!f || corpusBusy) return;
  if (!window.DESK_ADMIN || !window.DESK_ADMIN.loadCorpus) {
    setCorpusResult("err", "Cannot upload", "This page has no corpus API.");
    return;
  }
  corpusBusy = true;
  $("drop").classList.add("busy");
  const size = prettyBytes(f.size);
  setCorpusResult("busy", "Reading " + f.name, size);
  f.text().then(text => {
    setCorpusResult("busy", "Parsing JSON", size);
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      throw Object.assign(new Error("invalid_json"), { code: "invalid_json" });
    }
    const list = Array.isArray(data) ? data : (data && data.instances);
    const SCHEMA = "depict_annotation_v1";
    const seen = data && data.schema;
    if (seen !== SCHEMA) {
      $("schema-note").hidden = false;
      $("schema-note").textContent = seen
        ? "This bundle declares schema \u201c" + seen + "\u201d; the server requires \u201c" + SCHEMA + "\u201d."
        : "This bundle declares no schema. The server requires \u201c" + SCHEMA + "\u201d.";
    } else {
      $("schema-note").hidden = true;
    }
    if (!Array.isArray(list) || !list.length) {
      throw Object.assign(new Error("no_instances"), { code: "no_instances" });
    }
    setCorpusResult("busy", "Uploading " + list.length + " instances",
      size + " \u00b7 merged into the stored corpus; other projects are kept");
    return window.DESK_ADMIN.loadCorpus(text).then(out => {
      const n = out && out.loaded != null ? out.loaded : list.length;
      const total = out && out.total != null ? out.total : n;
      const proj = out && out.project;
      const detail = (proj ? n + " instances for " + proj : n + " instances merged")
        + ". Corpus is now " + total + ".";
      setCorpusResult("ok", "Upload succeeded", detail);
    });
  }).catch(e => {
    const code = e && e.code;
    const msg = code === "invalid_json" ? "That file is not valid JSON"
      : code === "no_instances" ? "No instances array found in that file"
      : code === "bad_schema" ? "Wrong schema (expected depict_annotation_v1)"
      : code === "instance_without_id" ? "An instance is missing an id"
      : code === "would_leak" ? "Upload refused: the bundle would leak gold labels (" + (e.detail || "") + ")"
      : code === "too_large" || (e && e.status === 413) ? "File is larger than the 256 MB limit"
      : code === "owner_only" || code === "permission_denied" ? "Only the study owner can upload a corpus"
      : code === "unauthenticated" ? "Signed out — open your personal link again"
      : "Upload failed" + (code ? " (" + code + ")" : "");
    setCorpusResult("err", "Upload failed", msg);
  }).finally(() => {
    corpusBusy = false;
    $("drop").classList.remove("busy");
    $("file").value = "";
  });
}

$("q").addEventListener("input", renderIndex);
$("only-open").addEventListener("change", renderIndex);

$("file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) ingestFile(f);
});
const drop = $("drop");
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("hot"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("hot"); }));
drop.addEventListener("drop", e => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) ingestFile(f);
});

if ($("ppl-add")) $("ppl-add").addEventListener("click", () => {
  const name = ($("ppl-name").value || "").trim();
  if (!name) { $("ppl-status").textContent = "A name is needed"; return; }
  if (!window.DESK_ADMIN) return;
  $("ppl-status").textContent = "Creating\u2026";
  window.DESK_ADMIN.create(name, $("ppl-owner").checked ? "owner" : "annotator")
    .then(x => {
      $("ppl-name").value = "";
      $("ppl-owner").checked = false;
      renderPeople();
      // renderPeople rebuilds the table; show the link after it settles
      setTimeout(() => {
        const box = $("ppl-link");
        box.hidden = false; box.className = "linkbox"; box.textContent = "";
        box.append(el("div", "lk-who", x.name + " \u00b7 " + x.role));
        box.append(el("code", "lk-url", x.link));
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
      }, 60);
    })
    .catch(e => { $("ppl-status").textContent = "Failed (" + ((e && e.code) || "error") + ")"; });
});

