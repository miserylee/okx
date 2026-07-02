import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectOkxDaemon } from "../src/sdk/client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = path.join(repoRoot, "mock", ".tmp");
const workspace = path.join(tmpRoot, "workspace");
const okxHome = path.join(tmpRoot, "home");
const cliPath = path.join(repoRoot, "bin", "okx.mjs");
const traderName = "mock-trader";
const storyEnv = {
  ...process.env,
  OKX_HOME: okxHome,
};

fs.rmSync(workspace, { recursive: true, force: true });
fs.rmSync(okxHome, { recursive: true, force: true });
fs.mkdirSync(workspace, { recursive: true });
process.env.OKX_HOME = okxHome;

try {
  runCli(["init", "--name", traderName]);
  assertWorkspaceBootstrapFiles();
  configureMockExchange();
  const contextOutput = runCli(["context"], { silent: true });
  assert.match(contextOutput, /OKX AI Trader Context/);
  assert.match(contextOutput, /npm run okx -- daemon start/);
  runCli(["daemon", "start"]);

  const okx = await connectOkxDaemon(traderName, {
    env: "sandbox",
    source: "mock/story.mjs",
  });

  const events = [];
  const controller = new AbortController();
  const eventPump = okx.events.subscribe((event) => events.push(event), {
    signal: controller.signal,
  });
  await waitFor(() => events.some((event) => event.type === "daemon.status"));

  const state = await okx.state();
  assert.equal(state.state, "active");

  const ticker = await okx.market.ticker("BTC-USDT");
  assert.equal(ticker.instId, "BTC-USDT");

  const candles = await okx.market.candles("BTC-USDT", { bar: "1m", limit: 3 });
  assert.equal(candles.length, 3);

  const balance = await okx.account.balance();
  assert.ok(balance.details.some((item) => item.ccy === "USDT"));

  const marketOrder = await okx.orders.placeMarketBuy("BTC-USDT", "0.001");
  assert.equal(marketOrder.state, "filled");

  await waitFor(() => events.some((event) => event.type === "order.update"));

  runCli(["daemon", "pause", "--reason", "mock story cli pause"], { silent: true });
  assert.equal((await okx.state()).state, "paused");
  await assertPausedWrite(okx);

  runCli(["daemon", "resume", "--reason", "mock story cli resume"], { silent: true });
  assert.equal((await okx.state()).state, "active");

  const paused = await okx.control.pause("mock story verifies sdk kill switch");
  assert.equal(paused.state, "paused");

  await assertPausedWrite(okx);

  const resumed = await okx.control.resume("mock story resumes trading");
  assert.equal(resumed.state, "active");

  const limitOrder = await okx.orders.place({
    instId: "BTC-USDT",
    side: "buy",
    ordType: "limit",
    sz: "0.01",
    px: "100",
  });
  assert.equal(limitOrder.state, "live");

  const openOrders = await okx.orders.open({ instId: "BTC-USDT" });
  assert.equal(openOrders.length, 1);

  const canceled = await okx.orders.cancel({
    instId: "BTC-USDT",
    ordId: limitOrder.ordId,
  });
  assert.equal(canceled.state, "canceled");

  controller.abort();
  await eventPump;

  const auditRecords = readAuditRecords();
  const kinds = auditRecords.map((record) => record.kind);
  for (const required of [
    "state.get",
    "market.ticker",
    "market.candles",
    "account.balance",
    "order.place",
    "control.pause",
    "control.resume",
    "orders.open",
    "order.cancel",
  ]) {
    assert.ok(kinds.includes(required), `Missing audit kind: ${required}`);
  }
  assert.ok(
    auditRecords.some(
      (record) => record.kind === "order.place" && record.error?.code === "DAEMON_PAUSED",
    ),
    "Missing paused write rejection audit record",
  );

  const auditText = fs.readFileSync(auditPath(), "utf8");
  assert.equal(/OKX_API_KEY|OKX_SECRET_KEY|OKX_PASSPHRASE/.test(auditText), false);

  console.log("Mock story passed");
  console.log(`Workspace: ${workspace}`);
  console.log(`Audit log: ${auditPath()}`);
} finally {
  try {
    runCli(["daemon", "stop"], { silent: true });
  } catch {
    // The daemon may already be stopped if the story failed during startup.
  }
}

function runCli(args, { silent = false } = {}) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: workspace,
    env: storyEnv,
    encoding: "utf8",
    stdio: silent ? "pipe" : "inherit",
  });
}

function auditPath() {
  return path.join(workspace, "logs", "audit.jsonl");
}

function configureMockExchange() {
  const filePath = path.join(workspace, "okx.config.json");
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(filePath, `${JSON.stringify({ ...config, exchange: "mock" }, null, 2)}\n`);
}

function assertWorkspaceBootstrapFiles() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.okx, "okx");
  assert.equal(packageJson.dependencies["okx-trader"], "^0.1.0");

  const agents = fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
  assert.match(agents, /npm run okx -- context/);
  assert.match(agents, /OKX AI Trader/);
}

function readAuditRecords() {
  return fs
    .readFileSync(auditPath(), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function assertPausedWrite(okx) {
  await assert.rejects(
    () => okx.orders.placeMarketBuy("BTC-USDT", "0.002"),
    (error) => error.status === 423 && /paused/i.test(error.message),
  );
}

async function waitFor(predicate, { timeoutMs = 5_000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for mock story condition");
}
