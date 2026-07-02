import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredSegments = new Set(["node_modules", ".git"]);
const ignoredPrefixes = [path.join(root, "mock", ".tmp")];
const files = [];

walk(root);

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

console.log(`Checked ${files.length} .mjs files`);

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) continue;

    const filePath = path.join(dirPath, entry.name);
    if (ignoredPrefixes.some((prefix) => filePath.startsWith(prefix))) continue;

    if (entry.isDirectory()) {
      walk(filePath);
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(filePath);
    }
  }
}
