export function mergePrepared(db, prepared) {
  const now = new Date().toISOString();
  const list = prepared.map((b) => {
    const project = typeof b.project === "string" ? b.project.trim() : "";
    return project ? { ...b, project } : { ...b };
  });
  const projects = [...new Set(list.map((b) => b.project).filter(Boolean))];

  return db.transaction(() => {
    let project = null;
    let removed = 0;
    if (projects.length === 1) {
      project = projects[0];
      removed = db
        .prepare("DELETE FROM instances WHERE json_extract(body, '$.project') = ?")
        .run(project).changes;
    }

    const ordById = new Map(
      db.prepare("SELECT id, ord FROM instances").all().map((r) => [r.id, r.ord])
    );
    let nextOrd = db.prepare("SELECT COALESCE(MAX(ord), -1) AS n FROM instances").get().n + 1;

    const upsert = db.prepare(
      `INSERT INTO instances (id, ord, blind, body, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         ord = excluded.ord, blind = excluded.blind,
         body = excluded.body, updated_at = excluded.updated_at`
    );

    let inserted = 0;
    let updated = 0;
    for (const b of list) {
      const had = ordById.has(b.id);
      const ord = had ? ordById.get(b.id) : nextOrd++;
      let row = b;
      if (had && !row.project) {
        const prev = db.prepare("SELECT body FROM instances WHERE id = ?").get(b.id);
        if (prev) {
          const old = JSON.parse(prev.body);
          if (old.project) row = { ...b, project: old.project };
        }
      }
      upsert.run(b.id, ord, row.blind ? 1 : 0, JSON.stringify(row), now);
      if (had) updated += 1;
      else inserted += 1;
      ordById.set(b.id, ord);
    }

    const total = db.prepare("SELECT COUNT(*) AS n FROM instances").get().n;
    const blind = db.prepare("SELECT COUNT(*) AS n FROM instances WHERE blind = 1").get().n;
    return {
      loaded: list.length,
      inserted,
      updated,
      removed,
      project,
      total,
      blind
    };
  })();
}
