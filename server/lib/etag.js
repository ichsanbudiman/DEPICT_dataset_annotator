// ETags must be quoted (RFC 7232). Fetch then sends If-None-Match with those
// quotes; a raw string compare against the unquoted version never 304s, so
// the app rebuilds the whole Annotate panel every poll.

const strip = (s) => String(s).trim().replace(/^W\//i, "").replace(/^"|"$/g, "");

export function etagMatch(req, version) {
  const raw = req.headers["if-none-match"];
  if (!raw || version == null) return false;
  const want = strip(version);
  return String(raw).split(",").some((p) => strip(p) === want);
}

export function setEtag(res, version) {
  const v = strip(version);
  res.set("ETag", `"${v}"`);
  return v;
}
