#!/usr/bin/env node
// Manage annotators from the command line.
//
//   npm run people                          list everyone
//   npm run people -- add "Judge One"       create, print the link once
//   npm run people -- add "Galahad" owner   create an owner
//   npm run people -- rotate <id>           new link, work kept
//   npm run people -- disable <id>          no sign-in, work kept
//   npm run people -- enable <id>
//   npm run people -- remove <id> --yes     delete them AND their work
import { db } from "../server/db.js";
import { createAnnotator, rotateToken, setDisabled } from "../server/auth.js";

const [, , cmd = "list", a, b] = process.argv;

const rows = () => db.prepare(
  `SELECT a.id, a.name, a.role, a.disabled, a.last_seen_at,
          (SELECT COUNT(*) FROM records r WHERE r.annotator_id = a.id) AS records
   FROM annotators a ORDER BY a.created_at`
).all();

function list() {
  const all = rows();
  if (!all.length) return console.log("\n  Nobody yet. Add one with:  npm run people -- add \"Their Name\"\n");
  console.log("");
  console.log("  " + "ID".padEnd(14) + "NAME".padEnd(22) + "ROLE".padEnd(11) +
              "RECORDS".padEnd(9) + "STATUS".padEnd(10) + "LAST SEEN");
  for (const r of all) {
    console.log("  " + r.id.padEnd(14) + r.name.slice(0, 20).padEnd(22) +
      r.role.padEnd(11) + String(r.records).padEnd(9) +
      (r.disabled ? "disabled" : "active").padEnd(10) +
      (r.last_seen_at ? r.last_seen_at.slice(0, 16).replace("T", " ") : "never"));
  }
  console.log("");
}

function showLink(x) {
  console.log(`\n  ${x.name}  (${x.role})`);
  console.log(`  ${x.link}\n`);
  if (x.role === "owner") {
    console.log("  That URL is the owner link. It looks the same as a judge's");
    console.log("  (no /owner in the path); after sign-in the header reads");
    console.log("  \"" + x.name + " · owner\" and Corpus, Review and People appear.\n");
  }
  console.log("  Shown once. Only its hash is stored, so it cannot be printed again.");
  console.log("  If it is lost or leaks, issue a new one with:  npm run people -- rotate " + x.id + "\n");
}

switch (cmd) {
  case "list":
    list();
    break;
  case "add": {
    if (!a) { console.error('Usage: npm run people -- add "Their Name" [owner]'); process.exit(1); }
    showLink(createAnnotator({ name: a, role: b === "owner" ? "owner" : "annotator" }));
    break;
  }
  case "rotate": {
    const out = a && rotateToken(a);
    if (!out) { console.error("No annotator with that id. Run: npm run people"); process.exit(1); }
    console.log("\n  Previous link is now dead, and any cookies already issued stop working.");
    console.log("  Their annotations are untouched.");
    showLink(out);
    break;
  }
  case "disable":
  case "enable": {
    if (!a || !setDisabled(a, cmd === "disable")) {
      console.error("No annotator with that id. Run: npm run people"); process.exit(1);
    }
    console.log(`\n  ${a} ${cmd}d. Their annotations are untouched.\n`);
    break;
  }
  case "remove": {
    const n = a ? db.prepare("SELECT COUNT(*) AS n FROM records WHERE annotator_id = ?").get(a).n : 0;
    if (!a) { console.error("Usage: npm run people -- remove <id> --yes"); process.exit(1); }
    if (b !== "--yes") {
      console.error(`\n  This deletes them AND their ${n} annotation record(s). It cannot be undone.`);
      console.error("  To keep the work and only kill the link, use rotate or disable.");
      console.error(`  If you are sure:  npm run people -- remove ${a} --yes\n`);
      process.exit(1);
    }
    db.prepare("DELETE FROM annotators WHERE id = ?").run(a);
    console.log(`\n  Removed ${a} and ${n} annotation record(s).\n`);
    break;
  }
  default:
    console.error(`Unknown command "${cmd}". Try: list, add, rotate, disable, enable, remove`);
    process.exit(1);
}
