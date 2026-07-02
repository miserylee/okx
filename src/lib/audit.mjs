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

  recent({ limit = 50, kind, source, env } = {}) {
    if (!fs.existsSync(this.filePath)) return [];
    const max = Math.max(1, Math.min(Number(limit) || 50, 500));
    const lines = fs.readFileSync(this.filePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const records = [];
    for (let index = lines.length - 1; index >= 0 && records.length < max; index -= 1) {
      let record;
      try {
        record = JSON.parse(lines[index]);
      } catch {
        continue;
      }
      if (kind && record.kind !== kind) continue;
      if (source && record.source !== source) continue;
      if (env && record.env !== env) continue;
      records.push(record);
    }
    return records;
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
