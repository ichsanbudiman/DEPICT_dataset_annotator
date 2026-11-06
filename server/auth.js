import crypto from "node:crypto";
import { db, newSessionEpoch } from "./db.js";
import { config } from "./config.js";

export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token), "utf8").digest("hex");

export const newToken = () => crypto.randomBytes(32).toString("base64url");

function sign(value) {
  const mac = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
  return `${value}.${mac}`;
}

function unsign(signed) {
  if (typeof signed !== "string") return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 1) return null;
  const value = signed.slice(0, dot);
  const expected = sign(value);
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  // Constant time, and length-safe: timingSafeEqual throws on a mismatch.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

const COOKIE = "desk_session";

function setSession(res, annotatorId, epoch) {
  res.cookie(COOKIE, sign(`${annotatorId}.${epoch}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: !config.insecureCookies,
    maxAge: 1000 * 60 * 60 * 24 * 90,
    path: "/"
  });
}

function parseSession(signed) {
  const payload = unsign(signed);
  if (!payload) return null;
  const dot = payload.indexOf(".");
  if (dot < 1) return null;
  return { id: payload.slice(0, dot), epoch: payload.slice(dot + 1) };
}

const findByToken = db.prepare("SELECT * FROM annotators WHERE token_hash = ?");
const findById = db.prepare("SELECT * FROM annotators WHERE id = ?");
const touch = db.prepare("UPDATE annotators SET last_seen_at = ? WHERE id = ?");

export function session(req, res, next) {
  const token = typeof req.query.t === "string" ? req.query.t : null;
  if (token) {
    const row = findByToken.get(hashToken(token));
    if (row && !row.disabled) {
      setSession(res, row.id, row.session_epoch);
      req.user = row;
      touch.run(new Date().toISOString(), row.id);
      req.tokenInUrl = true;
      return next();
    }
  }
  const sess = parseSession(req.cookies ? req.cookies[COOKIE] : null);
  if (sess) {
    const row = findById.get(sess.id);
    if (row && !row.disabled && row.session_epoch === sess.epoch) {
      req.user = row;
      // Polling /api/* every few seconds must not rewrite last_seen: that
      // churns the people list, the snapshot fires, and Annotate remounts.
      const path = req.path || "";
      if (!path.startsWith("/api")) {
        touch.run(new Date().toISOString(), row.id);
      }
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  const wantsHtml = req.accepts("html", "json") === "html";
  if (wantsHtml && !String(req.path || "").startsWith("/api")) {
    res.status(401).type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>Annotation desk</title>
<p>This page needs a personal link. Ask the study owner to send you one.</p>
`);
    return;
  }
  res.status(401).json({ error: "not_signed_in" });
}

export function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "not_signed_in" });
  if (req.user.role !== "owner") return res.status(403).json({ error: "owner_only" });
  next();
}

// Issue a fresh link for someone who already exists. Their annotations are
// untouched: the old link stops working, the person and their work remain.
// This is what you want when a link leaks or a laptop is lost, and it is the
// reason deleting is not the only way to take a link out of circulation.
export function rotateToken(id) {
  const token = newToken();
  const info = db
    .prepare("UPDATE annotators SET token_hash = ?, session_epoch = ? WHERE id = ?")
    .run(hashToken(token), newSessionEpoch(), id);
  if (!info.changes) return null;
  const row = db.prepare("SELECT id, name, role FROM annotators WHERE id = ?").get(id);
  return { ...row, token, link: `${config.publicUrl}/?t=${token}` };
}

// Disabling keeps everything and only stops them signing in. Reversible,
// unlike deleting, so it is the right move when you are not sure.
export function setDisabled(id, disabled) {
  const info = db
    .prepare("UPDATE annotators SET disabled = ? WHERE id = ?")
    .run(disabled ? 1 : 0, id);
  return info.changes > 0;
}

export function createAnnotator({ name, role = "annotator" }) {
  const token = newToken();
  const id = crypto.randomBytes(9).toString("base64url");
  db.prepare(
    "INSERT INTO annotators (id, name, token_hash, role, created_at, session_epoch) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, hashToken(token), role, new Date().toISOString(), newSessionEpoch());
  return { id, name, role, token, link: `${config.publicUrl}/?t=${token}` };
}
