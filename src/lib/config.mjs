import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "./paths.mjs";

export const CONFIG_FILE = "okx.config.json";
export const DEFAULT_CREDENTIALS = {
  live: "./credentials.env",
  sandbox: "./credentials.sandbox.env",
};

export function configPath(workspace) {
  return path.join(workspace, CONFIG_FILE);
}

export function loadWorkspaceConfig(workspace) {
  const filePath = configPath(workspace);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${CONFIG_FILE}. Run: okx init --name <ai-trader-name>`);
  }

  const raw = readJsonFile(filePath);
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error(`${CONFIG_FILE} must contain a string "name" field`);
  }

  return normalizeConfig(raw);
}

export function normalizeConfig(raw) {
  return {
    ...raw,
    credentials: {
      ...DEFAULT_CREDENTIALS,
      ...(raw.credentials || {}),
    },
    exchange: raw.exchange || process.env.OKX_DAEMON_EXCHANGE || "okx",
    watchlist: normalizeWatchlist(raw.watchlist),
  };
}

export function normalizeWatchlist(watchlist = []) {
  if (!Array.isArray(watchlist)) return [];
  return watchlist
    .map((item) => {
      if (typeof item === "string") {
        return { instId: item, enabled: true };
      }
      if (!item || typeof item !== "object") return null;
      return {
        ...item,
        instId: item.instId,
        enabled: item.enabled !== false,
      };
    })
    .filter((item) => typeof item?.instId === "string" && item.instId.length > 0);
}

export function writeWorkspaceConfig(workspace, raw) {
  ensureDir(workspace);
  writeJsonFile(configPath(workspace), raw);
}

export function credentialPath(workspace, config, env) {
  const configured = config.credentials?.[env];
  if (!configured) throw new Error(`Unsupported credential env: ${env}`);
  return path.resolve(workspace, configured);
}

export function validateEnv(env) {
  if (env !== "sandbox" && env !== "live") {
    throw new Error(`env must be "sandbox" or "live", got: ${env || "(missing)"}`);
  }
  return env;
}
