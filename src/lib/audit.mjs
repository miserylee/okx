import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir } from "./paths.mjs";

const SENSITIVE_KEY_PATTERN = /api.?key|secret|passphrase|signature|authorization|access.?sign|token/i;

export class AuditLog {
  constructor({ workspace, name }) {
    this.workspace = workspace;
    this.name = name;
    this.filePath = path.join(workspace, "logs", "audit.jsonl");
  }

  append(record) {
    ensureDir(path.dirname(this.filePath));
    const fullRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      name: this.name,
      ...scrub(record),
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(fullRecord)}\n`);
    return fullRecord;
  }
}

export function scrub(value) {
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = scrub(item);
    }
  }
  return result;
}
