// ---- boot --------------------------------------------------------
render();
const use = (n) => (window.claude && window.claude.use) ? window.claude.use(n) : Promise.resolve(null);
use("user").then(u => {
  user = u;
  if (!u) {
    $("who").textContent = "Signed out — annotations cannot be saved";
    applyRole();
    return;
  }
  isOwner = u.isOwner ? u.isOwner() : false;
  identityKnown = true;
  applyRole();
  Promise.resolve(u.id ? u.id() : null).then(id => { uid = id; startDb(); });
  Promise.resolve(u.can ? u.can("data.write") : null).then(c => { canWrite = c; render(); }).catch(() => {});
  Promise.resolve(u.me ? u.me() : null).then(me => {
    const nm = (me && me.name) || "";
    $("who").textContent = (nm ? nm : "Signed in") + (isOwner ? " · owner" : "");
  }).catch(() => { $("who").textContent = "Signed in"; });
}).catch(() => { applyRole(); });

use("downloads").then(d => { downloads = d; render(); }).catch(() => {});

function sameCorpus(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i] !== b[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}
function sameMap(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of b) {
    const o = a.get(k);
    if (!o) return false;
    if (o.updated !== v.updated || o.submitted !== v.submitted || o.note !== v.note) return false;
    if (JSON.stringify(o.labels || {}) !== JSON.stringify(v.labels || {})) return false;
  }
  return true;
}

function startDb() {
  use("db").then(d => {
    db = d;
    if (!d) { $("who").textContent = "Storage unavailable — annotations cannot be saved"; return; }

    db.collection("instances").orderBy("ord").onSnapshot(snap => {
      const next = snap.docs.map(x => Object.assign({ id: x.id }, x.data()));
      if (cursor >= next.length) cursor = 0;
      if (sameCorpus(instances, next)) return;
      instances = next;
      render();
    }, err => {
      // A judge has no Corpus panel, so this element may be gone.
      const cs = $("cor-status");
      if (cs) cs.textContent = "Could not read the corpus (" + err.code + ")";
      $("who").textContent = "Could not read the corpus (" + err.code + ")";
    });

    if (uid) {
      db.doc("records/" + uid).collection("items").onSnapshot(snap => {
        const next = new Map(snap.docs.map(x => [x.id, x.data()]));
        if (pendingId && mine.has(pendingId)) {
          const live = mine.get(pendingId);
          const remote = next.get(pendingId);
          next.set(pendingId, remote
            ? Object.assign({}, remote, { labels: live.labels, submitted: live.submitted, submitted_at: live.submitted_at })
            : live);
        }
        if (sameMap(mine, next)) return;
        mine = next;
        render();
      }, () => {});
    }
    if (isOwner) {
      db.collection("records").onSnapshot(() => reloadAll(), () => {});
      db.collection("final").onSnapshot(snap => {
        const next = new Map(snap.docs.map(x => [x.id, x.data()]));
        if (sameMap(finals, next)) return;
        finals = next;
        render();
      }, () => {});
    }
  }).catch(() => {});
}

function reloadAll() {
  if (!db || !isOwner) return;
  db.collection("records").get().then(snap => {
    const annotators = snap.docs.map(d => d.id);
    Promise.all(annotators.map(a =>
      db.doc("records/" + a).collection("items").get()
        .then(s => s.docs.map(x => Object.assign({ annotator: a, instance: x.id }, x.data())))
        .catch(() => [])
    )).then(lists => {
      const next = lists.flat();
      if (next.length === allRecords.length &&
          next.every((r, i) => r.annotator === allRecords[i].annotator &&
            r.instance === allRecords[i].instance &&
            r.updated === allRecords[i].updated &&
            r.submitted === allRecords[i].submitted)) return;
      allRecords = next;
      render();
    });
  }).catch(() => {});
}

