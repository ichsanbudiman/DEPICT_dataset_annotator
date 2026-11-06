// The resolution rule, server side, so the exported dataset does not depend
// on a browser having been open. It is deliberately the same rule the app
// shows in the Review tab:
//
//   every annotator said the same thing   -> that verdict        agreed
//   they differed and it was adjudicated  -> the adjudication    adjudicated
//   they differed and it was not          -> no label            open
//   only one annotator judged it          -> that verdict        single
//
// Unanimous "unsure" is NOT a resolution: nobody decided, so it is open.
// Disagreement is never settled by majority.

export const PATTERNS = ["Adapter", "Facade", "Factory", "Observer", "Visitor"];
export const VERDICTS = ["yes", "no", "unsure"];

/**
 * Keep only known pattern -> verdict pairs. Unknown keys or values are errors
 * rather than silently counted toward "all five decided".
 */
export function parseLabels(incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return { error: "bad_labels" };
  }
  const labels = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (!PATTERNS.includes(k)) return { error: "unknown_pattern", pattern: k };
    if (!VERDICTS.includes(v)) return { error: "bad_verdict", value: v, pattern: k };
    labels[k] = v;
  }
  return { labels };
}

export function labelsComplete(labels) {
  return PATTERNS.every((p) => VERDICTS.includes(labels[p]));
}

export function resolveInstance(instanceId, recordsForInstance, finalDoc) {
  const fin = (finalDoc && finalDoc.labels) || {};
  const by = (finalDoc && finalDoc.by) || null;
  const labels = {};

  for (const pattern of PATTERNS) {
    const verdicts = recordsForInstance
      .map((r) => (r.labels || {})[pattern])
      .filter(Boolean);

    if (verdicts.length === 0) {
      labels[pattern] = { value: null, from: "missing" };
      continue;
    }
    const distinct = new Set(verdicts);
    if (distinct.size === 1 && !distinct.has("unsure")) {
      labels[pattern] = {
        value: verdicts[0],
        from: verdicts.length === 1 ? "single" : "agreed",
        annotators: verdicts.length
      };
    } else if (fin[pattern]) {
      labels[pattern] = { value: fin[pattern], from: "adjudicated", by, verdicts };
    } else {
      labels[pattern] = { value: null, from: "open", verdicts };
    }
  }

  return {
    instance: instanceId,
    labels,
    patterns: PATTERNS.filter((p) => labels[p].value === "yes"),
    complete: PATTERNS.every((p) => labels[p].value !== null),
    annotators: recordsForInstance.length
  };
}
