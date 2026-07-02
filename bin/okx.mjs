#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { credentialPath, configPath, DEFAULT_CREDENTIALS, loadWorkspaceConfig, writeWorkspaceConfig } from "../src/lib/config.mjs";
import { CLI_SCRIPT_NAME, PACKAGE_NAME, renderAgentBootstrapGuide, renderAgentContext } from "../src/context/agent-manual.mjs";
import { writeCredentialsTemplate } from "../src/lib/env.mjs";
import { ensureDir, readJsonFile, resolveWorkspace, sleep, toPosixPath } from "../src/lib/paths.mjs";
import { fetchJsonWithTimeout, readHealthyRegistry, readRegistry, removeRegistry } from "../src/lib/registry.mjs";
import { runDaemon } from "../src/daemon/server.mjs";

const cliPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(cliPath), "..");
const packageInfo = readJsonFile(path.join(packageRoot, "package.json"));
const packageVersion = packageInfo.version;

async function main() {
  const argv = process.argv.slice(2);
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    const options = parseOptions([subcommand, ...rest].filter(Boolean));
    if (options.help) {
      printInitHelp();
      return;
    }
    await initWorkspace(options);
    return;
  }

  if (command === "context") {
    console.log(renderAgentContext());
    return;
  }

  if (command === "daemon") {
    const options = parseOptions(rest);
    if (!subcommand || subcommand === "--help" || subcommand === "-h" || options.help) {
      printDaemonHelp();
      return;
    }
    await daemonCommand(subcommand, options);
    return;
  }

  if (command === "state") {
    const options = parseOptions([subcommand, ...rest].filter(Boolean));
    if (options.help) {
      printStateHelp();
      return;
    }
    await stateCommand(options);
    return;
  }

  if (command === "instruments") {
    const args = [subcommand, ...rest].filter(Boolean);
    const options = parseOptions(args);
    const action = subcommand?.startsWith("-") ? null : subcommand;
    if (subcommand === "--help" || subcommand === "-h" || options.help) {
      printInstrumentsHelp();
      return;
    }
    await instrumentsCommand(action, options);
    return;
  }

  if (command === "market") {
    const options = parseOptions(rest);
    if (!subcommand || subcommand === "--help" || subcommand === "-h" || options.help) {
      printMarketHelp();
      return;
    }
    await marketCommand(subcommand, options);
    return;
  }

  if (command === "account") {
    const options = parseOptions(rest);
    if (!subcommand || subcommand === "--help" || subcommand === "-h" || options.help) {
      printAccountHelp();
      return;
    }
    await accountCommand(subcommand, options);
    return;
  }

  if (command === "orders") {
    const options = parseOptions(rest);
    if (!subcommand || subcommand === "--help" || subcommand === "-h" || options.help) {
      printOrdersHelp();
      return;
    }
    await ordersCommand(subcommand, options);
    return;
  }

  if (command === "fills") {
    const args = [subcommand, ...rest].filter(Boolean);
    const options = parseOptions(args);
    const action = subcommand?.startsWith("-") ? null : subcommand;
    if (subcommand === "--help" || subcommand === "-h" || options.help) {
      printFillsHelp();
      return;
    }
    await fillsCommand(action, options);
    return;
  }

  if (command === "audit") {
    const options = parseOptions(rest);
    if (!subcommand || subcommand === "--help" || subcommand === "-h" || options.help) {
      printAuditHelp();
      return;
    }
    await auditCommand(subcommand, options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function initWorkspace(options) {
  const workspace = resolveWorkspace(options.workspace || process.cwd());
  const name = options.name;
  if (!name) throw new Error("okx init requires --name <ai-trader-name>");

  ensureDir(workspace);
  const existing = fs.existsSync(configPath(workspace)) ? readJsonFile(configPath(workspace)) : {};
  writeWorkspaceConfig(workspace, {
    ...existing,
    name,
    credentials: {
      ...DEFAULT_CREDENTIALS,
      ...(existing.credentials || {}),
    },
  });

  for (const dir of ["strategies", "docs", "logs", "runtime"]) {
    ensureDir(path.join(workspace, dir));
  }

  const config = loadWorkspaceConfig(workspace);
  writeCredentialsTemplate(credentialPath(workspace, config, "live"));
  writeCredentialsTemplate(credentialPath(workspace, config, "sandbox"));
  updatePackageJson(workspace);
  updateGitignore(workspace);
  updateAgentsGuide(workspace);
  writeWorkspaceDoc(workspace, name);

  console.log(`Initialized OKX AI trader workspace: ${name}`);
  console.log(`Workspace: ${workspace}`);
}

async function daemonCommand(subcommand, options) {
  if (!subcommand) throw new Error("Missing daemon subcommand");
  const workspace = resolveWorkspace(options.workspace || process.cwd());

  if (subcommand === "serve") {
    await runDaemon({ workspace });
    return;
  }

  if (subcommand === "start") {
    await startDaemon(workspace);
    return;
  }
  if (subcommand === "stop") {
    await stopDaemon(workspace);
    return;
  }
  if (subcommand === "restart") {
    await stopDaemon(workspace, { quiet: true });
    await startDaemon(workspace);
    return;
  }
  if (subcommand === "status") {
    await statusDaemon(workspace);
    return;
  }
  if (subcommand === "doctor") {
    await doctorDaemon(workspace);
    return;
  }
  if (subcommand === "pause") {
    await controlDaemon(workspace, "pause", options.reason || "");
    return;
  }
  if (subcommand === "resume") {
    await controlDaemon(workspace, "resume", options.reason || "");
    return;
  }

  throw new Error(`Unknown daemon subcommand: ${subcommand}`);
}

async function stateCommand(options) {
  const payload = await daemonRequest({
    workspace: options.workspace,
    method: "GET",
    pathname: "/v1/state",
    options,
  });
  printJson(payload.data ?? payload);
}

async function instrumentsCommand(subcommand, options) {
  const action = subcommand || "list";
  if (action === "list") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/instruments",
      query: {
        instType: options.instType || "SPOT",
        instId: options.instId,
        uly: options.uly,
        instFamily: options.instFamily,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  if (action === "get") {
    const instId = requireOption(options, "instId", "--inst-id");
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: `/v1/instruments/${encodeURIComponent(instId)}`,
      query: {
        instType: options.instType || "SPOT",
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown instruments subcommand: ${subcommand}`);
}

async function marketCommand(subcommand, options) {
  if (subcommand === "ticker") {
    const instId = requireOption(options, "instId", "--inst-id");
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/market/ticker",
      query: { instId },
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "candles") {
    const instId = requireOption(options, "instId", "--inst-id");
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/market/candles",
      query: {
        instId,
        bar: options.bar || "1m",
        limit: options.limit || "100",
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown market subcommand: ${subcommand}`);
}

async function accountCommand(subcommand, options) {
  if (subcommand === "balance") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/account/balance",
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "positions") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/account/positions",
      query: {
        instType: options.instType,
        instId: options.instId,
        posId: options.posId,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "available") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/account/available",
      query: {
        ccy: options.ccy,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown account subcommand: ${subcommand}`);
}

async function ordersCommand(subcommand, options) {
  if (subcommand === "open") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/orders/open",
      query: {
        instId: options.instId,
        instType: options.instType,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "history") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/orders/history",
      query: {
        instType: options.instType,
        instId: options.instId,
        state: options.state,
        after: options.after,
        before: options.before,
        limit: options.limit,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "algo-open") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/orders/algo/open",
      query: orderAlgoQuery(options),
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "algo-history") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/orders/algo/history",
      query: orderAlgoQuery(options),
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "algo-get") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/orders/algo/get",
      query: orderAlgoIdentity(options),
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "preview") {
    const body = orderPlaceBody(options);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/preview",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "place") {
    const body = orderPlaceBody(options);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/place",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  if (
    subcommand === "algo-place" ||
    subcommand === "take-profit" ||
    subcommand === "stop-loss" ||
    subcommand === "tp-sl"
  ) {
    const body = orderAlgoPlaceBody(options, subcommand);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/algo/place",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "algo-amend") {
    const body = orderAlgoAmendBody(options);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/algo/amend",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "algo-cancel") {
    const body = orderAlgoCancelBody(options);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/algo/cancel",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  if (subcommand === "cancel") {
    const body = orderCancelBody(options);
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "POST",
      pathname: "/v1/orders/cancel",
      body,
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown orders subcommand: ${subcommand}`);
}

async function fillsCommand(subcommand, options) {
  const action = subcommand || "list";
  if (action === "list") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/fills",
      query: {
        instType: options.instType,
        instId: options.instId,
        ordId: options.ordId || options.orderId,
        after: options.after,
        before: options.before,
        limit: options.limit,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown fills subcommand: ${subcommand}`);
}

async function auditCommand(subcommand, options) {
  if (subcommand === "recent") {
    const payload = await daemonRequest({
      workspace: options.workspace,
      method: "GET",
      pathname: "/v1/audit/recent",
      query: {
        limit: options.limit,
        kind: options.kind,
        source: options.recordSource,
        recordEnv: options.recordEnv,
      },
      options,
    });
    printJson(payload.data);
    return;
  }

  throw new Error(`Unknown audit subcommand: ${subcommand}`);
}

async function daemonRequest({ workspace, method, pathname, query = {}, body, options = {} }) {
  const root = resolveWorkspace(workspace || process.cwd());
  const config = loadWorkspaceConfig(root);
  const registry = readRegistry(config.name);
  if (!registry?.baseUrl) {
    throw new Error(`Daemon is not running for ${config.name}. Run: okx daemon start`);
  }

  const url = new URL(`${registry.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const env = options.env || process.env.OKX_TRADER_ENV || process.env.OKX_ENV || "sandbox";
  const source = options.source || "cli";
  const init = {
    method,
    timeoutMs: Number(options.timeoutMs || 10_000),
    headers: {
      "x-okx-env": env,
      "x-okx-source": source,
    },
  };
  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return fetchJsonWithTimeout(url.toString(), init);
}

async function startDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const current = await readHealthyRegistry(config.name);
  if (current.healthy) {
    console.log(`Daemon already running: ${current.registry.baseUrl}`);
    return;
  }
  if (current.registry) removeRegistry(config.name);

  ensureDir(path.join(workspace, "runtime"));
  const logPath = path.join(workspace, "runtime", "daemon.log");
  const out = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [cliPath, "daemon", "serve", "--workspace", workspace], {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
    windowsHide: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await readHealthyRegistry(config.name);
    if (result.healthy) {
      console.log(`Daemon started: ${result.registry.baseUrl}`);
      return;
    }
    await sleep(100);
  }

  throw new Error(`Daemon did not start. Check ${logPath}`);
}

async function stopDaemon(workspace, { quiet = false } = {}) {
  const config = loadWorkspaceConfig(workspace);
  const registry = readRegistry(config.name);
  if (!registry) {
    if (!quiet) console.log("Daemon is not running");
    return;
  }

  if (registry.baseUrl) {
    try {
      await fetchJsonWithTimeout(`${registry.baseUrl}/v1/internal/shutdown`, {
        method: "POST",
        timeoutMs: 1_000,
      });
    } catch {
      // Fall back to pid signal below.
    }
  }

  if (registry.pid && isProcessRunning(registry.pid)) {
    try {
      process.kill(registry.pid, "SIGTERM");
    } catch {
      // The daemon may have already exited after the shutdown request.
    }
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await readHealthyRegistry(config.name);
    if (!current.healthy) break;
    await sleep(100);
  }
  removeRegistry(config.name);
  if (!quiet) console.log("Daemon stopped");
}

async function statusDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const result = await readHealthyRegistry(config.name);
  console.log(
    JSON.stringify(
      {
        running: result.healthy,
        registry: result.registry,
        health: result.health,
      },
      null,
      2,
    ),
  );
}

async function doctorDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const registry = await readHealthyRegistry(config.name);
  const liveCredentials = credentialPath(workspace, config, "live");
  const sandboxCredentials = credentialPath(workspace, config, "sandbox");

  console.log(
    JSON.stringify(
      {
        ok: true,
        name: config.name,
        workspace,
        exchange: config.exchange,
        credentials: {
          live: { path: toPosixPath(liveCredentials), exists: fs.existsSync(liveCredentials) },
          sandbox: {
            path: toPosixPath(sandboxCredentials),
            exists: fs.existsSync(sandboxCredentials),
          },
        },
        daemon: {
          running: registry.healthy,
          registry: registry.registry,
        },
      },
      null,
      2,
    ),
  );
}

async function controlDaemon(workspace, action, reason) {
  const config = loadWorkspaceConfig(workspace);
  const registry = readRegistry(config.name);
  if (!registry?.baseUrl) throw new Error(`Daemon is not running for ${config.name}`);
  const payload = await fetchJsonWithTimeout(`${registry.baseUrl}/v1/control/${action}`, {
    method: "POST",
    timeoutMs: 2_000,
    headers: {
      "Content-Type": "application/json",
      "x-okx-source": "cli",
    },
    body: JSON.stringify({ reason }),
  });
  console.log(JSON.stringify(payload, null, 2));
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const [key, inlineValue] = arg.slice(2).split("=", 2);
      let value = inlineValue;
      if (value == null && args[index + 1] && shouldConsumeOptionValue(args[index + 1])) {
        value = args[index + 1];
        index += 1;
      }
      if (value == null) value = true;
      options[toCamelCase(key)] = value;
    }
  }
  return options;
}

function shouldConsumeOptionValue(value) {
  return !value.startsWith("-") || /^-\d/.test(value);
}

function updateGitignore(workspace) {
  const filePath = path.join(workspace, ".gitignore");
  const required = ["credentials.env", "credentials.*.env", "logs/", "runtime/", "*.log"];
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];
  const set = new Set(existing.filter(Boolean));
  let changed = false;
  for (const entry of required) {
    if (!set.has(entry)) {
      existing.push(entry);
      set.add(entry);
      changed = true;
    }
  }
  if (changed || !fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${existing.filter(Boolean).join("\n")}\n`);
  }
}

function updatePackageJson(workspace) {
  const filePath = path.join(workspace, "package.json");
  const existing = fs.existsSync(filePath) ? readJsonFile(filePath) : {};
  const next = {
    ...existing,
    private: existing.private ?? true,
    type: existing.type || "module",
    scripts: {
      ...(existing.scripts || {}),
      [CLI_SCRIPT_NAME]: "okx",
    },
    dependencies: {
      ...(existing.dependencies || {}),
      [PACKAGE_NAME]: existing.dependencies?.[PACKAGE_NAME] || `^${packageVersion}`,
    },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

function orderPlaceBody(options) {
  const instId = requireOption(options, "instId", "--inst-id");
  const side = requireOption(options, "side", "--side");
  const ordType = options.ordType || options.type || "market";
  const sz = options.sz || options.size || options.amount;
  if (!sz) throw new Error("orders place requires --size <amount>");

  const body = {
    instId,
    side,
    ordType,
    sz,
  };
  if (options.price || options.px) body.px = options.price || options.px;
  if (options.tdMode) body.tdMode = options.tdMode;
  if (options.clOrdId || options.clientOrderId) {
    body.clOrdId = options.clOrdId || options.clientOrderId;
  }
  return body;
}

function orderCancelBody(options) {
  const instId = requireOption(options, "instId", "--inst-id");
  const ordId = options.ordId || options.orderId;
  const clOrdId = options.clOrdId || options.clientOrderId;
  if (!ordId && !clOrdId) {
    throw new Error("orders cancel requires --ord-id <id> or --client-order-id <id>");
  }
  return {
    instId,
    ...(ordId ? { ordId } : {}),
    ...(clOrdId ? { clOrdId } : {}),
  };
}

function orderAlgoQuery(options) {
  return {
    instType: options.instType,
    instId: options.instId,
    ordType: options.ordType || options.type,
    state: options.state,
    algoId: options.algoId,
    algoClOrdId: options.algoClOrdId || options.clientAlgoOrderId,
    after: options.after,
    before: options.before,
    limit: options.limit,
  };
}

function orderAlgoIdentity(options) {
  const instId = requireOption(options, "instId", "--inst-id");
  const algoId = options.algoId;
  const algoClOrdId = options.algoClOrdId || options.clientAlgoOrderId;
  if (!algoId && !algoClOrdId) {
    throw new Error("orders algo-get requires --algo-id <id> or --client-algo-order-id <id>");
  }
  return {
    instId,
    ordType: options.ordType || options.type,
    ...(algoId ? { algoId } : {}),
    ...(algoClOrdId ? { algoClOrdId } : {}),
  };
}

function orderAlgoPlaceBody(options, subcommand = "algo-place") {
  const instId = requireOption(options, "instId", "--inst-id");
  const side = requireOption(options, "side", "--side");
  const sz = options.sz || options.size || options.amount;
  if (!sz) throw new Error(`${subcommand} requires --size <amount>`);

  const body = {
    instId,
    side,
    ordType: options.ordType || options.type || "conditional",
    sz,
  };

  copyOptions(body, options, [
    "tdMode",
    "ccy",
    "posSide",
    "reduceOnly",
    "tgtCcy",
    "algoClOrdId",
    "tag",
    "quickMgnType",
    "stpMode",
    "triggerPx",
    "orderPx",
    "triggerPxType",
    "tpTriggerPx",
    "tpOrdPx",
    "tpTriggerPxType",
    "slTriggerPx",
    "slOrdPx",
    "slTriggerPxType",
    "callbackRatio",
    "callbackSpread",
    "activePx",
  ]);
  if (options.clientAlgoOrderId && !body.algoClOrdId) body.algoClOrdId = options.clientAlgoOrderId;

  if (subcommand === "take-profit") {
    body.tpTriggerPx = options.tpTriggerPx || requireOption(options, "triggerPx", "--trigger-px");
    body.tpOrdPx = options.tpOrdPx || options.orderPx || "-1";
    if (options.triggerPxType && !body.tpTriggerPxType) body.tpTriggerPxType = options.triggerPxType;
  }

  if (subcommand === "stop-loss") {
    body.slTriggerPx = options.slTriggerPx || requireOption(options, "triggerPx", "--trigger-px");
    body.slOrdPx = options.slOrdPx || options.orderPx || "-1";
    if (options.triggerPxType && !body.slTriggerPxType) body.slTriggerPxType = options.triggerPxType;
  }

  if (subcommand === "tp-sl") {
    if (!body.tpTriggerPx) throw new Error("orders tp-sl requires --tp-trigger-px <price>");
    if (!body.slTriggerPx) throw new Error("orders tp-sl requires --sl-trigger-px <price>");
    body.tpOrdPx = body.tpOrdPx || "-1";
    body.slOrdPx = body.slOrdPx || "-1";
  }

  return body;
}

function orderAlgoAmendBody(options) {
  const body = orderAlgoIdentity(options);
  copyOptions(body, options, [
    "cxlOnFail",
    "reqId",
    "newSz",
    "newTpTriggerPx",
    "newTpOrdPx",
    "newTpTriggerPxType",
    "newSlTriggerPx",
    "newSlOrdPx",
    "newSlTriggerPxType",
    "newTriggerPx",
    "newOrderPx",
    "newTriggerPxType",
  ]);
  return body;
}

function orderAlgoCancelBody(options) {
  return orderAlgoIdentity(options);
}

function copyOptions(target, source, keys) {
  for (const key of keys) {
    if (source[key] != null && source[key] !== true && source[key] !== "") {
      target[key] = source[key];
    }
  }
}

function requireOption(options, key, label) {
  const value = options[key];
  if (value == null || value === true || value === "") {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function updateAgentsGuide(workspace) {
  const filePath = path.join(workspace, "AGENTS.md");
  const start = "<!-- okx-trader:start -->";
  const end = "<!-- okx-trader:end -->";
  const section = `${start}\n${renderAgentBootstrapGuide().trim()}\n${end}`;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Agent Guide\n\n${section}\n`);
    return;
  }

  const existing = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, section)
    : `${existing.trimEnd()}\n\n${section}\n`;
  fs.writeFileSync(filePath, next);
}

function writeWorkspaceDoc(workspace, name) {
  const filePath = path.join(workspace, "docs", "okx-workspace.md");
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(
    filePath,
    [
      `# OKX Workspace: ${name}`,
      "",
      "This workspace belongs to one AI trader. Strategy scripts can connect to the local daemon",
      "through the Node SDK after the daemon is started.",
      "",
      "Useful commands:",
      "",
      "```bash",
      "npm run okx -- context",
      "npm run okx -- daemon start",
      "npm run okx -- daemon status",
      "npm run okx -- daemon pause --reason \"manual pause\"",
      "npm run okx -- daemon resume --reason \"manual resume\"",
      "npm run okx -- daemon stop",
      "```",
      "",
      "Credential files are local-only and ignored by git:",
      "",
      "- `credentials.env`",
      "- `credentials.sandbox.env`",
      "",
    ].join("\n"),
  );
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printHelp() {
  console.log(`OKX AI trader daemon

Usage:
  okx <command> [options]

Start here:
  Agents should run "okx context" or "npm run okx -- context" before operating a workspace.

Commands:
  okx context
  okx init --name <ai-trader-name>
  okx state
  okx daemon start
  okx daemon stop
  okx daemon restart
  okx daemon status
  okx daemon doctor
  okx daemon pause --reason "..."
  okx daemon resume --reason "..."
  okx instruments --inst-type SPOT --inst-id BTC-USDT
  okx market ticker --inst-id BTC-USDT
  okx market candles --inst-id BTC-USDT --bar 1m --limit 100
  okx account balance
  okx account positions
  okx account available --ccy USDT
  okx orders open
  okx orders preview --inst-id BTC-USDT --side buy --type market --size 0.001
  okx orders history --inst-id BTC-USDT
  okx orders place --inst-id BTC-USDT --side buy --type market --size 0.001
  okx orders cancel --inst-id BTC-USDT --ord-id <order-id>
  okx orders tp-sl --inst-id BTC-USDT --side sell --size 0.001 --tp-trigger-px 70000 --sl-trigger-px 62000
  okx orders algo-open --inst-id BTC-USDT
  okx orders algo-cancel --inst-id BTC-USDT --algo-id <algo-id>
  okx fills --inst-id BTC-USDT
  okx audit recent --limit 20

Options:
  --workspace <path>  Use a workspace other than the current directory.
  --env <env>         Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>    Audit source label. Defaults to cli.
`);
}

function printInitHelp() {
  console.log(`Initialize an OKX AI trader workspace

Usage:
  okx init --name <ai-trader-name> [--workspace <path>]

Options:
  --name <name>       AI trader identity for this workspace.
  --workspace <path>  Workspace directory. Defaults to the current directory.
  -h, --help          Show this help.
`);
}

function printDaemonHelp() {
  console.log(`Manage the OKX AI trader daemon

Usage:
  okx daemon start [--workspace <path>]
  okx daemon stop [--workspace <path>]
  okx daemon restart [--workspace <path>]
  okx daemon status [--workspace <path>]
  okx daemon doctor [--workspace <path>]
  okx daemon pause --reason "..."
  okx daemon resume --reason "..."

Options:
  --workspace <path>  Workspace directory. Defaults to the current directory.
  --reason <text>     Reason recorded for pause/resume operations.
  -h, --help          Show this help.
`);
}

function printStateHelp() {
  console.log(`Read daemon execution state through the daemon API

Usage:
  okx state [--env sandbox] [--source cli]

Options:
  --workspace <path>  Workspace directory. Defaults to the current directory.
  --env <env>         Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>    Audit source label. Defaults to cli.
`);
}

function printInstrumentsHelp() {
  console.log(`Read OKX instrument metadata through the daemon API

Usage:
  okx instruments [--inst-type SPOT] [--inst-id BTC-USDT]
  okx instruments list [--inst-type SPOT] [--inst-id BTC-USDT]
  okx instruments get --inst-id BTC-USDT [--inst-type SPOT]

Options:
  --workspace <path>     Workspace directory. Defaults to the current directory.
  --env <env>            Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>       Audit source label. Defaults to cli.
  --inst-type <type>     OKX instrument type. Defaults to SPOT.
  --inst-id <id>         OKX instrument id, for example BTC-USDT.
  --uly <uly>            Optional OKX underlying filter.
  --inst-family <name>   Optional OKX instrument family filter.
`);
}

function printMarketHelp() {
  console.log(`Read market data through the daemon API

Usage:
  okx market ticker --inst-id BTC-USDT [--env sandbox] [--source cli]
  okx market candles --inst-id BTC-USDT --bar 1m --limit 100

Options:
  --workspace <path>  Workspace directory. Defaults to the current directory.
  --env <env>         Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>    Audit source label. Defaults to cli.
  --inst-id <id>      OKX instrument id, for example BTC-USDT.
  --bar <bar>         Candle bar. Defaults to 1m.
  --limit <count>     Candle count. Defaults to 100.
`);
}

function printAccountHelp() {
  console.log(`Read account data through the daemon API

Usage:
  okx account balance [--env sandbox] [--source cli]
  okx account positions [--inst-type SWAP] [--inst-id BTC-USDT-SWAP]
  okx account available [--ccy USDT]

Options:
  --workspace <path>  Workspace directory. Defaults to the current directory.
  --env <env>         Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>    Audit source label. Defaults to cli.
  --inst-type <type>  Optional OKX instrument type for positions.
  --inst-id <id>      Optional OKX instrument id for positions.
  --pos-id <id>       Optional OKX position id.
  --ccy <ccy>         Optional currency filter for available balances.
`);
}

function printOrdersHelp() {
  console.log(`Trade through the daemon API

Usage:
  okx orders open [--inst-id BTC-USDT]
  okx orders history [--inst-id BTC-USDT]
  okx orders preview --inst-id BTC-USDT --side buy --type market --size 0.001
  okx orders place --inst-id BTC-USDT --side buy --type market --size 0.001
  okx orders place --inst-id BTC-USDT --side buy --type limit --size 0.001 --price 100
  okx orders cancel --inst-id BTC-USDT --ord-id <order-id>
  okx orders take-profit --inst-id BTC-USDT --side sell --size 0.001 --trigger-px 70000
  okx orders stop-loss --inst-id BTC-USDT --side sell --size 0.001 --trigger-px 62000
  okx orders tp-sl --inst-id BTC-USDT --side sell --size 0.001 --tp-trigger-px 70000 --sl-trigger-px 62000
  okx orders algo-place --inst-id BTC-USDT --side sell --type conditional --size 0.001 --tp-trigger-px 70000 --tp-ord-px -1
  okx orders algo-open [--inst-id BTC-USDT] [--type conditional]
  okx orders algo-history [--inst-id BTC-USDT]
  okx orders algo-get --inst-id BTC-USDT --algo-id <algo-id>
  okx orders algo-amend --inst-id BTC-USDT --algo-id <algo-id> --new-sl-trigger-px 61000 --new-sl-ord-px -1
  okx orders algo-cancel --inst-id BTC-USDT --algo-id <algo-id>

Options:
  --workspace <path>               Workspace directory. Defaults to the current directory.
  --env <env>                      Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>                 Audit source label. Defaults to cli.
  --inst-id <id>                   OKX instrument id, for example BTC-USDT.
  --side <buy|sell>                Order side.
  --type <type>                    Order type. Regular defaults to market; algo defaults to conditional.
  --size <amount>                  Order size.
  --price <price>                  Limit order price.
  --td-mode <mode>                 OKX trade mode. Defaults in daemon adapter.
  --tp-trigger-px <price>          Take-profit trigger price for conditional algo orders.
  --tp-ord-px <price|-1>           Take-profit order price. Use -1 for market.
  --sl-trigger-px <price>          Stop-loss trigger price for conditional algo orders.
  --sl-ord-px <price|-1>           Stop-loss order price. Use -1 for market.
  --trigger-px <price>             Trigger price for take-profit, stop-loss, or trigger algo orders.
  --order-px <price|-1>            Trigger order execution price. Use -1 for market.
  --trigger-px-type <last|index|mark>  Trigger price type when required by OKX.
  --algo-id <id>                   Exchange algo order id for get/amend/cancel.
  --client-algo-order-id <id>      Client algo order id for place/get/amend/cancel.
  --state <state>                  Optional history state filter.
  --after <cursor>                 Optional OKX pagination cursor.
  --before <cursor>                Optional OKX pagination cursor.
  --limit <count>                  Optional OKX result count.
  --ord-id <id>                    Exchange order id for cancel.
  --client-order-id <id>           Client order id for place/cancel.
`);
}

function printFillsHelp() {
  console.log(`Read fills through the daemon API

Usage:
  okx fills [--inst-id BTC-USDT]
  okx fills list [--inst-id BTC-USDT] [--ord-id <order-id>]

Options:
  --workspace <path>  Workspace directory. Defaults to the current directory.
  --env <env>         Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>    Audit source label. Defaults to cli.
  --inst-type <type>  Optional OKX instrument type.
  --inst-id <id>      Optional OKX instrument id.
  --ord-id <id>       Optional order id.
  --after <cursor>    Optional OKX pagination cursor.
  --before <cursor>   Optional OKX pagination cursor.
  --limit <count>     Optional OKX result count.
`);
}

function printAuditHelp() {
  console.log(`Read recent local audit records through the daemon API

Usage:
  okx audit recent [--limit 20]

Options:
  --workspace <path>       Workspace directory. Defaults to the current directory.
  --env <env>              Daemon request environment: sandbox or live. Defaults to sandbox.
  --source <label>         Audit source label for this audit read. Defaults to cli.
  --limit <count>          Number of recent records to return. Defaults to 50, max 500.
  --kind <kind>            Optional audit kind filter.
  --record-source <label>  Optional source filter for returned records.
  --record-env <env>       Optional env filter for returned records.
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
