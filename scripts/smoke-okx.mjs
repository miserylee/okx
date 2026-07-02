import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent as UndiciProxyAgent, setGlobalDispatcher } from "undici";
import WebSocket from "ws";

const DEFAULT_CREDENTIALS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".okx",
  "okx-api-credentials.env",
);
const DEFAULT_REST_BASE_URL = "https://www.okx.com";
const DEFAULT_LIVE_WS_BASE_URL = "wss://ws.okx.com:8443/ws/v5";
const DEFAULT_SIMULATED_WS_BASE_URL = "wss://wspap.okx.com:8443/ws/v5";
const SIMULATED_BROKER_QUERY = "brokerId=9999";

function parseArgs(argv) {
  const options = {
    envPath: process.env.OKX_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_PATH,
    instId: process.env.OKX_SMOKE_INST_ID || "BTC-USDT",
    publicOnly: false,
    proxyUrl:
      process.env.OKX_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      "",
    restBaseUrl: process.env.OKX_REST_BASE_URL || DEFAULT_REST_BASE_URL,
    simulated: parseBoolean(process.env.OKX_SIMULATED_TRADING) ?? false,
    timeoutMs: Number(process.env.OKX_SMOKE_TIMEOUT_MS || 15_000),
    wsBaseUrl: process.env.OKX_WS_BASE_URL,
    wsAgent: undefined,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--public-only" || arg === "--skip-private") {
      options.publicOnly = true;
    } else if (arg === "--simulated" || arg === "--demo") {
      options.simulated = true;
    } else if (arg === "--live") {
      options.simulated = false;
    } else if (arg === "--no-proxy") {
      options.noProxy = true;
      options.proxyUrl = "";
    } else if (arg.startsWith("--env=")) {
      options.envPath = arg.slice("--env=".length);
    } else if (arg.startsWith("--inst-id=")) {
      options.instId = arg.slice("--inst-id=".length);
    } else if (arg.startsWith("--proxy=")) {
      options.proxyUrl = arg.slice("--proxy=".length);
      options.noProxy = false;
    } else if (arg.startsWith("--rest-base-url=")) {
      options.restBaseUrl = arg.slice("--rest-base-url=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg.startsWith("--ws-base-url=")) {
      options.wsBaseUrl = arg.slice("--ws-base-url=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error("--timeout-ms must be a number >= 1000");
  }

  if (!options.noProxy && !options.proxyUrl) {
    options.proxyUrl = detectWindowsSystemProxy() || "";
  }
  if (options.proxyUrl) {
    options.proxyUrl = normalizeProxyUrl(options.proxyUrl);
  }

  return options;
}

function printHelp() {
  console.log(`OKX smoke test

Usage:
  npm run smoke:okx -- [options]

Options:
  --public-only          Only test public REST and public WebSocket.
  --simulated, --demo    Use OKX demo trading mode.
  --live                 Use OKX live trading mode. This is the default.
  --inst-id=BTC-USDT     Instrument used for market data smoke checks.
  --env=PATH             Credentials env file path.
  --proxy=URL            HTTP proxy URL. Defaults to env proxy or Windows system proxy.
  --no-proxy             Disable proxy auto-detection.
  --rest-base-url=URL    REST base URL. Defaults to https://www.okx.com.
  --ws-base-url=URL      WebSocket base URL ending in /ws/v5.
  --timeout-ms=15000     Per-step timeout.
`);
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
    const output = execFileSync(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
      ],
      { encoding: "utf8" },
    );
    if (!/\bProxyEnable\s+REG_DWORD\s+0x1\b/i.test(output)) return "";

    const proxyServerOutput = execFileSync(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer",
      ],
      { encoding: "utf8" },
    );
    const match = proxyServerOutput.match(/\bProxyServer\s+REG_SZ\s+(.+)\r?$/im);
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

function maskProxyUrl(proxyUrl) {
  if (!proxyUrl) return "(none)";
  const url = new URL(proxyUrl);
  if (url.username) url.username = "***";
  if (url.password) url.password = "***";
  return url.toString();
}

function configureProxy(options) {
  if (!options.proxyUrl) return;

  setGlobalDispatcher(new UndiciProxyAgent(options.proxyUrl));
  options.wsAgent = new HttpsProxyAgent(options.proxyUrl);
}

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      throw new Error(`Invalid env line in ${filePath}: ${rawLine}`);
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  return env;
}

function loadCredentials(options) {
  if (options.publicOnly) {
    return {};
  }

  const fileEnv = parseEnvFile(options.envPath);
  const env = { ...fileEnv, ...process.env };

  const apiKey = env.OKX_API_KEY?.trim();
  const secretKey = env.OKX_SECRET_KEY?.trim();
  const passphrase = env.OKX_PASSPHRASE?.trim();

  const missing = [];
  if (!apiKey) missing.push("OKX_API_KEY");
  if (!secretKey) missing.push("OKX_SECRET_KEY");
  if (!passphrase) missing.push("OKX_PASSPHRASE");
  if (missing.length > 0) {
    throw new Error(
      `Missing credentials in ${options.envPath}: ${missing.join(", ")}`,
    );
  }

  return { apiKey, secretKey, passphrase };
}

function sign({ timestamp, method, requestPath, body = "", secretKey }) {
  return crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}${method.toUpperCase()}${requestPath}${body}`)
    .digest("base64");
}

function restHeaders({ credentials, method, requestPath, body, simulated }) {
  const timestamp = new Date().toISOString();
  const headers = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": credentials.apiKey,
    "OK-ACCESS-SIGN": sign({
      timestamp,
      method,
      requestPath,
      body,
      secretKey: credentials.secretKey,
    }),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": credentials.passphrase,
  };

  if (simulated) {
    headers["x-simulated-trading"] = "1";
  }

  return headers;
}

function buildRequestPath(pathname, query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") search.set(key, String(value));
  }

  const queryString = search.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

async function okxGet({ pathname, query, privateRequest, credentials, options }) {
  const requestPath = buildRequestPath(pathname, query);
  const headers = {};

  if (privateRequest) {
    Object.assign(
      headers,
      restHeaders({
        credentials,
        method: "GET",
        requestPath,
        body: "",
        simulated: options.simulated,
      }),
    );
  } else if (options.simulated) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetchWithTimeout(
    `${trimTrailingSlash(options.restBaseUrl)}${requestPath}`,
    {
      headers,
      timeoutMs: options.timeoutMs,
    },
  );
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`REST ${requestPath} returned non-JSON response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`REST ${requestPath} HTTP ${response.status}: ${text}`);
  }
  if (payload.code !== "0") {
    throw new Error(
      `REST ${requestPath} OKX code ${payload.code}: ${payload.msg || ""}`,
    );
  }

  return payload;
}

async function fetchWithTimeout(url, { timeoutMs, ...init }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw enrichNetworkError(error, url);
  } finally {
    clearTimeout(timer);
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function enrichNetworkError(error, url) {
  const target = new URL(url);
  const cause = error.cause;
  const details = [
    `Network request failed for ${target.origin}`,
    cause?.code && `code=${cause.code}`,
    cause?.syscall && `syscall=${cause.syscall}`,
    cause?.hostname && `hostname=${cause.hostname}`,
    error.name === "AbortError" && "request timed out",
  ].filter(Boolean);

  return new Error(
    `${details.join(" ")}. Check DNS/proxy/network access for ${target.hostname}.`,
    { cause: error },
  );
}

function wsUrl({ channelType, options }) {
  const defaultBaseUrl = options.simulated
    ? DEFAULT_SIMULATED_WS_BASE_URL
    : DEFAULT_LIVE_WS_BASE_URL;
  const baseUrl = trimTrailingSlash(options.wsBaseUrl || defaultBaseUrl);
  if (options.simulated && !options.wsBaseUrl) {
    return `${baseUrl}/${channelType}?${SIMULATED_BROKER_QUERY}`;
  }
  return `${baseUrl}/${channelType}`;
}

async function connectWebSocket(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      agent: options.wsAgent,
      handshakeTimeout: options.timeoutMs,
    });
    const timer = setTimeout(() => {
      cleanup();
      tryClose(ws);
      reject(new Error(`WebSocket open timed out: ${url}`));
    }, options.timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off("open", onOpen);
      ws.off("error", onError);
    }
    function onOpen() {
      cleanup();
      resolve(ws);
    }
    function onError(error) {
      cleanup();
      const target = new URL(url);
      reject(
        new Error(
          `WebSocket error while opening ${target.origin}: ${error.message}. Check DNS/proxy/network access for ${target.hostname}.`,
        ),
      );
    }

    ws.once("open", onOpen);
    ws.once("error", onError);
  });
}

async function waitForMessage(ws, predicate, { timeoutMs, label }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    }
    function onError(error) {
      cleanup();
      reject(new Error(`${label} WebSocket error: ${error.message}`));
    }
    function onClose(code, reason) {
      cleanup();
      const reasonText = Buffer.isBuffer(reason) ? reason.toString("utf8") : String(reason || "");
      reject(
        new Error(
          `${label} WebSocket closed before expected message: ${code} ${reasonText}`,
        ),
      );
    }
    async function onMessage(data) {
      const text = await eventDataToText(data);
      if (text === "pong") return;

      let message;
      try {
        message = JSON.parse(text);
      } catch {
        cleanup();
        reject(new Error(`${label} received non-JSON message: ${text}`));
        return;
      }

      if (message.event === "error") {
        cleanup();
        reject(
          new Error(
            `${label} OKX WebSocket error ${message.code}: ${message.msg}`,
          ),
        );
        return;
      }

      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

async function eventDataToText(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (data instanceof Blob)
    return Buffer.from(await data.arrayBuffer()).toString("utf8");
  return String(data);
}

function wsSend(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function tryClose(ws) {
  try {
    ws.close(1000, "smoke complete");
  } catch {
    // Ignore close races during smoke-test cleanup.
  }
}

async function smokeRestPublic(credentials, options) {
  const time = await okxGet({
    pathname: "/api/v5/public/time",
    privateRequest: false,
    credentials,
    options,
  });
  console.log(`[REST public time] OK serverTs=${time.data?.[0]?.ts}`);

  const ticker = await okxGet({
    pathname: "/api/v5/market/ticker",
    query: { instId: options.instId },
    privateRequest: false,
    credentials,
    options,
  });
  const data = ticker.data?.[0] ?? {};
  console.log(
    `[REST market ticker] OK instId=${data.instId} last=${data.last} bid=${data.bidPx} ask=${data.askPx}`,
  );
}

async function smokeRestPrivate(credentials, options) {
  const balance = await okxGet({
    pathname: "/api/v5/account/balance",
    privateRequest: true,
    credentials,
    options,
  });
  const detailCount = balance.data?.[0]?.details?.length ?? 0;
  console.log(`[REST private balance] OK detailCount=${detailCount}`);
}

async function smokeWsPublic(options) {
  const url = wsUrl({ channelType: "public", options });
  const ws = await connectWebSocket(url, options);
  try {
    wsSend(ws, {
      op: "subscribe",
      args: [{ channel: "tickers", instId: options.instId }],
    });

    await waitForMessage(
      ws,
      (message) =>
        message.event === "subscribe" &&
        message.arg?.channel === "tickers" &&
        message.arg?.instId === options.instId,
      { timeoutMs: options.timeoutMs, label: "WS public subscribe" },
    );

    const ticker = await waitForMessage(
      ws,
      (message) =>
        message.arg?.channel === "tickers" &&
        message.arg?.instId === options.instId &&
        Array.isArray(message.data),
      { timeoutMs: options.timeoutMs, label: "WS public ticker data" },
    );
    const data = ticker.data?.[0] ?? {};
    console.log(
      `[WS public ticker] OK instId=${data.instId} last=${data.last} bid=${data.bidPx} ask=${data.askPx}`,
    );
  } finally {
    tryClose(ws);
  }
}

async function smokeWsPrivate(credentials, options) {
  const url = wsUrl({ channelType: "private", options });
  const ws = await connectWebSocket(url, options);
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    wsSend(ws, {
      op: "login",
      args: [
        {
          apiKey: credentials.apiKey,
          passphrase: credentials.passphrase,
          timestamp,
          sign: sign({
            timestamp,
            method: "GET",
            requestPath: "/users/self/verify",
            secretKey: credentials.secretKey,
          }),
        },
      ],
    });

    await waitForMessage(
      ws,
      (message) => message.event === "login" && message.code === "0",
      { timeoutMs: options.timeoutMs, label: "WS private login" },
    );
    console.log("[WS private login] OK");

    wsSend(ws, {
      op: "subscribe",
      args: [{ channel: "account" }],
    });
    await waitForMessage(
      ws,
      (message) =>
        message.event === "subscribe" && message.arg?.channel === "account",
      { timeoutMs: options.timeoutMs, label: "WS private account subscribe" },
    );
    console.log("[WS private account subscribe] OK");
  } finally {
    tryClose(ws);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  configureProxy(options);

  const credentials = loadCredentials(options);
  console.log("OKX smoke test starting");
  console.log(`mode=${options.simulated ? "simulated" : "live"}`);
  console.log(`instId=${options.instId}`);
  console.log(`proxy=${maskProxyUrl(options.proxyUrl)}`);
  console.log(`restBaseUrl=${options.restBaseUrl}`);
  console.log(
    `wsBaseUrl=${
      options.wsBaseUrl ||
      (options.simulated
        ? DEFAULT_SIMULATED_WS_BASE_URL
        : DEFAULT_LIVE_WS_BASE_URL)
    }`,
  );
  console.log(`credentialsFile=${path.resolve(options.envPath)}`);
  console.log(`apiKey=${options.publicOnly ? "(not loaded)" : "(loaded)"}`);

  await smokeRestPublic(credentials, options);
  await smokeWsPublic(options);

  if (!options.publicOnly) {
    await smokeRestPrivate(credentials, options);
    await smokeWsPrivate(credentials, options);
  }

  console.log("OKX smoke test completed");
}

main().catch((error) => {
  console.error(`OKX smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
