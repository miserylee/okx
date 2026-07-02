import fs from "node:fs";
import { registryPath, removeFileIfExists, VERSION, writeJsonFile } from "./paths.mjs";

export function readRegistry(name) {
  const filePath = registryPath(name);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeRegistry(entry) {
  writeJsonFile(registryPath(entry.name), {
    version: VERSION,
    ...entry,
  });
}

export function removeRegistry(name) {
  removeFileIfExists(registryPath(name));
}

export async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs || 2_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 120)}`);
      }
    }
    if (!response.ok || payload.ok === false) {
      const message = payload.error?.message || payload.message || response.statusText;
      const error = new Error(`${response.status} ${message}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function readHealthyRegistry(name) {
  const registry = readRegistry(name);
  if (!registry?.baseUrl) return { registry, health: null, healthy: false };

  try {
    const health = await fetchJsonWithTimeout(`${registry.baseUrl}/v1/health`);
    return { registry, health, healthy: true };
  } catch {
    return { registry, health: null, healthy: false };
  }
}
