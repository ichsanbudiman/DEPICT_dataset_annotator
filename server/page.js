import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const VIEWS = ["annotate.html", "review.html", "people.html", "corpus.html"];
const SCRIPTS = [
  "state.js",
  "boot.js",
  "records.js",
  "render.js",
  "graph.js",
  "annotate.js",
  "review.js",
  "corpus.js",
  "people.js",
  "tabs.js"
];

function read(rel) {
  return fs.readFileSync(path.join(publicDir, rel), "utf8").replace(/\n$/, "");
}

export function deskPage() {
  const shell = read("index.html");
  const views = VIEWS.map((name) => read(path.join("views", name))).join("\n\n");
  if (!shell.includes("<!--views-->")) {
    throw new Error("public/index.html is missing <!--views-->");
  }
  return shell.replace("<!--views-->", views);
}

export function deskScript() {
  const body = SCRIPTS.map((name) => read(path.join("js", name))).join("\n");
  return `(function () {\n"use strict";\n${body}\n})();\n`;
}
