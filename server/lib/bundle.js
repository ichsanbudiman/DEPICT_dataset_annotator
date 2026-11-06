import { forClient, assertClean } from "./sanitise.js";
import { pickSnippets } from "./snippets.js";

export const SCHEMA = "depict_annotation_v1";

function stamp(bundle, inst) {
  const project = typeof bundle.project === "string" ? bundle.project.trim() : "";
  const neighbourhood = typeof bundle.neighbourhood === "string" ? bundle.neighbourhood.trim() : "";
  const hops = Number.isFinite(bundle.hops) ? bundle.hops : null;
  const snippets = pickSnippets(bundle, inst);
  const row = { ...inst };
  if (!row.project && project) row.project = project;
  if ((row.hops == null || row.hops === "") && hops != null) row.hops = hops;
  if (!row.neighbourhood && neighbourhood) row.neighbourhood = neighbourhood;
  if (Object.keys(snippets).length) row.files = snippets;
  else if (!row.files) row.files = {};
  return row;
}

/**
 * @returns {{ prepared: object[] } | { error: string, expected?: string, got?: unknown, detail?: string }}
 */
export function prepareBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return { error: "bad_schema", expected: SCHEMA, got: null };
  }
  if (bundle.schema !== SCHEMA) {
    return { error: "bad_schema", expected: SCHEMA, got: bundle.schema ?? null };
  }
  if (!Array.isArray(bundle.instances) || !bundle.instances.length) {
    return { error: "no_instances" };
  }

  const prepared = [];
  for (const inst of bundle.instances) {
    if (!inst || !inst.id) return { error: "instance_without_id" };
    const clean = forClient(stamp(bundle, inst));
    try {
      assertClean(clean);
    } catch (e) {
      return { error: "would_leak", detail: e.message };
    }
    prepared.push(clean);
  }
  return { prepared };
}
