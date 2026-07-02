import { execFileSync } from "node:child_process";
import { ProxyAgent, setGlobalDispatcher } from "undici";

let configuredProxyUrl;

export function configureUndiciProxy() {
  if (configuredProxyUrl !== undefined) return configuredProxyUrl;
  if (parseBoolean(process.env.OKX_NO_PROXY) === true) {
    configuredProxyUrl = "";
    return configuredProxyUrl;
  }

  configuredProxyUrl =
    normalizeProxyUrl(
      process.env.OKX_PROXY ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        detectWindowsSystemProxy() ||
        "",
    ) || "";

  if (configuredProxyUrl) {
    setGlobalDispatcher(new ProxyAgent(configuredProxyUrl));
  }

  return configuredProxyUrl;
}

function parseBoolean(value) {
  if (value == null || value === "") return undefined;
  if (/^(1|true|yes|y)$/i.test(value)) return true;
  if (/^(0|false|no|n)$/i.test(value)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function detectWindowsSystemProxy() {
  if (process.platform !== "win32") return "";

  try {
    const enabledOutput = execFileSync(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
      ],
      { encoding: "utf8" },
    );
    if (!/\bProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enabledOutput)) return "";

    const proxyOutput = execFileSync(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer",
      ],
      { encoding: "utf8" },
    );
    const match = proxyOutput.match(/\bProxyServer\s+REG_SZ\s+(.+)\r?$/im);
    if (!match) return "";
    return pickProxyServer(match[1].trim());
  } catch {
    return "";
  }
}

function pickProxyServer(proxyServer) {
  if (!proxyServer.includes("=")) return proxyServer;

  const entries = new Map();
  for (const part of proxyServer.split(";")) {
    const [scheme, value] = part.split("=");
    if (scheme && value) entries.set(scheme.trim().toLowerCase(), value.trim());
  }

  return entries.get("https") || entries.get("http") || "";
}

function normalizeProxyUrl(proxyUrl) {
  const trimmed = proxyUrl.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}
