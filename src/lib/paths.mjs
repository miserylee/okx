import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const VERSION = "0.1.3";

export function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

export function okxHome() {
  return path.resolve(process.env.OKX_HOME || path.join(homeDir(), ".okx"));
}

export function registryDir() {
  return path.join(okxHome(), "registry");
}

export function registryPath(name) {
  return path.join(registryDir(), `${encodeURIComponent(name)}.json`);
}

export function resolveWorkspace(workspace = process.cwd()) {
  return path.resolve(workspace);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(`${tmpPath}`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

export function removeFileIfExists(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup for stale runtime files.
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}
