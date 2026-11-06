#!/usr/bin/env node
//   npm run annotator -- "Judge One"
//   npm run annotator -- "Galahad" owner
import { createAnnotator } from "../server/auth.js";

const [, , name, role] = process.argv;
if (!name) {
  console.error('Usage: npm run annotator -- "Their Name" [owner]');
  process.exit(1);
}
const a = createAnnotator({ name, role: role === "owner" ? "owner" : "annotator" });
console.log(`\n  ${a.name}  (${a.role})`);
console.log(`  ${a.link}\n`);
if (a.role === "owner") {
  console.log("  That URL is the owner link. It looks the same as a judge's");
  console.log("  (no /owner in the path); after sign-in the header reads");
  console.log("  \"" + a.name + " · owner\" and Corpus, Review and People appear.\n");
}
console.log("  Send that link to them and keep no copy: only its hash is stored,");
console.log("  so it cannot be shown again. Lost link means a new one.\n");
