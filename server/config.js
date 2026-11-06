import fs from "node:fs";
import path from "node:path";

function loadDotEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadDotEnv();

const required = (name) => {
  const v = process.env[name];
  if (!v || v === "change-me") {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return v;
};

export const config = {
  port: Number(process.env.PORT || 8080),
  dbPath: path.resolve(process.env.DB_PATH || "./data/desk.db"),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`)
    .replace(/\/+$/, ""),
  sessionSecret: required("SESSION_SECRET"),
  insecureCookies: process.env.INSECURE_COOKIES === "1"
};
