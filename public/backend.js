
(function () {
  "use strict";

  var POLL_MS = 4000;
  var api = function (p) { return "/api" + p; };

  if (window.location.search.indexOf("t=") >= 0) {
    try { history.replaceState(null, "", window.location.pathname); } catch (e) {}
  }

  function req(method, path, body) {
    return fetch(api(path), {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 304) return null;
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var err = new Error(j.error || ("http_" + r.status));
          err.code = j.error === "owner_only" ? "permission_denied"
                   : j.error === "not_signed_in" ? "unauthenticated"
                   : (j.error || "http_" + r.status);
          throw err;
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  // ---- polling subscriptions -------------------------------------------
  var watchers = {};

  function subscribe(path, cb, onErr) {
    var w = watchers[path];
    if (!w) {
      w = watchers[path] = { etag: null, cbs: [], last: null, timer: null };
      var tick = function () {
        fetch(api(path), {
          credentials: "same-origin",
          cache: "no-store",
          headers: w.etag ? { "If-None-Match": w.etag } : undefined
        }).then(function (r) {
          if (r.status === 304) {
            if (w.last) return null;
            w.etag = null;
            return fetch(api(path), { credentials: "same-origin", cache: "reload" })
              .then(function (r2) {
                if (!r2.ok) throw new Error("http_" + r2.status);
                w.etag = r2.headers.get("ETag");
                return r2.json();
              });
          }
          if (!r.ok) throw new Error("http_" + r.status);
          var tag = r.headers.get("ETag");
          if (tag && tag === w.etag && w.last) return null;
          w.etag = tag;
          return r.json();
        }).then(function (data) {
          if (!data) return;
          w.last = data.docs || [];
          w.cbs.forEach(function (c) { c.cb(snapshot(w.last)); });
        }).catch(function (e) {
          w.cbs.forEach(function (c) { if (c.onErr) c.onErr(e); });
        });
      };
      w.timer = setInterval(tick, POLL_MS);
      tick();
    }
    var entry = { cb: cb, onErr: onErr };
    w.cbs.push(entry);
    if (w.last) cb(snapshot(w.last));
    return function unsubscribe() {
      w.cbs = w.cbs.filter(function (c) { return c !== entry; });
    };
  }
  function refreshAll() {
    Object.keys(watchers).forEach(function (p) {
      var w = watchers[p];
      w.etag = null;
      fetch(api(p), { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          w.last = d.docs || [];
          w.cbs.forEach(function (c) { c.cb(snapshot(w.last)); });
        }).catch(function () {});
    });
  }

  function snapshot(docs) {
    return {
      docs: docs.map(function (d) {
        return { id: d.id, data: function () { return d; } };
      })
    };
  }

  // ---- the db shape the app expects ------------------------------------
  var ME = { id: null, isOwner: false, name: null };

  function pathFor(collection) {
    if (collection === "instances") return "/instances";
    if (collection === "final") return "/final";
    if (collection === "records") return "/annotators";
    var m = /^records\/([^/]+)\/items$/.exec(collection);
    if (m) {
      return (m[1] === ME.id)
        ? "/records/mine"
        : "/records/all?annotator=" + encodeURIComponent(m[1]);
    }
    throw new Error("backend.js: no route for collection \"" + collection + "\"");
  }

  function collectionHandle(collection) {
    var path = pathFor(collection);
    return {
      orderBy: function () { return collectionHandle(collection); },
      onSnapshot: function (cb, onErr) { return subscribe(path, cb, onErr); },
      get: function () {
        return req("GET", path).then(function (d) { return snapshot((d && d.docs) || []); });
      },
      doc: function (id) {
        return {
          set: function (body) {
            var p = collection === "final" ? "/final/" + encodeURIComponent(id)
                  : collection === "instances" ? "/instances/" + encodeURIComponent(id)
                  : /^records\//.test(collection) ? "/records/mine/" + encodeURIComponent(id)
                  : null;
            if (!p) throw new Error("backend.js: writes to \"" + collection + "\" are server side");
            return req("PUT", p, body).then(function (r) { refreshAll(); return r; });
          }
        };
      }
    };
  }

  var db = {
    collection: collectionHandle,
    doc: function (docPath) {
      return { collection: function (sub) { return collectionHandle(docPath + "/" + sub); } };
    }
  };

  var user = {
    isOwner: function () { return ME.isOwner; },
    id: function () { return Promise.resolve(ME.id); },
    can: function () { return Promise.resolve(true); },
    me: function () { return Promise.resolve({ name: ME.name }); }
  };

  var downloads = {
    save: function (opts) {
      var blob = new Blob([opts.data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = opts.filename || "download.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return Promise.resolve();
    }
  };

  // The app calls use() during boot, so identity has to be known first.
  var ready = req("GET", "/me").then(function (m) {
    ME.id = m.id; ME.isOwner = !!m.isOwner; ME.name = m.name;
  }).catch(function () { /* the page itself is behind requireUser */ });
  window.DESK_ADMIN = {
    loadCorpus: function (jsonText) {
      return fetch(api("/instances"), {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: jsonText
      }).then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            var err = new Error(j.error || ("http_" + r.status));
            err.code = j.error || ("http_" + r.status);
            err.detail = j.detail || j.hint || j.expected;
            err.status = r.status;
            throw err;
          });
        }
        return r.json();
      }).then(function (out) { refreshAll(); return out; });
    },
    list: function () { return req("GET", "/annotators"); },
    create: function (name, role) { return req("POST", "/annotators", { name: name, role: role }); },
    rotate: function (id) { return req("POST", "/annotators/" + encodeURIComponent(id) + "/rotate"); },
    setDisabled: function (id, disabled) {
      return req("POST", "/annotators/" + encodeURIComponent(id) + "/disabled", { disabled: !!disabled });
    },
    remove: function (id) {
      return req("DELETE", "/annotators/" + encodeURIComponent(id) +
        "?confirm=delete-their-annotations");
    }
  };

  window.claude = {
    use: function (name) {
      return ready.then(function () {
        if (name === "db") return db;
        if (name === "user") return user;
        if (name === "downloads") return downloads;
        return null;
      });
    }
  };
})();
