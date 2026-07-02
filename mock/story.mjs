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
  const initHelp = runCli(["init", "--help"], { silent: true });
  assert.match(initHelp, /okx init --name <ai-trader-name>/);
  assert.doesNotMatch(initHelp, /requires --name/);

  const daemonHelp = runCli(["daemon", "--help"], { silent: true });
  assert.match(daemonHelp, /okx daemon start/);

  runCli(["init", "--name", traderName]);
  assertWorkspaceBootstrapFiles();
  configureMockExchange();
  const contextOutput = runCli(["context"], { silent: true });
  assert.match(contextOutput, /OKX AI Trader Context/);
  assert.match(contextOutput, /npm run okx -- daemon start/);
  runCli(["daemon", "start"]);

  const cliInstruments = runCliJson([
    "instruments",
    "--inst-type",
    "SPOT",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-instruments",
  ]);
  assert.equal(cliInstruments.length, 1);
  assert.equal(cliInstruments[0].instId, "BTC-USDT");

  const cliTicker = runCliJson([
    "market",
    "ticker",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-ticker",
  ]);
  assert.equal(cliTicker.instId, "BTC-USDT");

  const cliBooks = runCliJson([
    "market",
    "books",
    "--inst-id",
    "BTC-USDT",
    "--size",
    "2",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-books",
  ]);
  assert.equal(cliBooks.bids.length, 2);

  const cliTrades = runCliJson([
    "market",
    "trades",
    "--inst-id",
    "BTC-USDT",
    "--limit",
    "2",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-trades",
  ]);
  assert.equal(cliTrades.length, 2);

  const cliFundingRate = runCliJson([
    "market",
    "funding-rate",
    "--inst-id",
    "BTC-USDT-SWAP",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-funding-rate",
  ]);
  assert.equal(cliFundingRate.instId, "BTC-USDT-SWAP");

  const cliOpenInterest = runCliJson([
    "market",
    "open-interest",
    "--inst-id",
    "BTC-USDT-SWAP",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-open-interest",
  ]);
  assert.equal(cliOpenInterest[0].instId, "BTC-USDT-SWAP");

  const cliBalance = runCliJson([
    "account",
    "balance",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-balance",
  ]);
  assert.ok(cliBalance.details.some((item) => item.ccy === "USDT"));

  const cliPositions = runCliJson([
    "account",
    "positions",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-positions",
  ]);
  assert.ok(cliPositions.some((item) => item.instId === "BTC-USDT"));

  const cliAvailable = runCliJson([
    "account",
    "available",
    "--ccy",
    "USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-available",
  ]);
  assert.equal(cliAvailable.details[0].ccy, "USDT");

  const cliBills = runCliJson([
    "account",
    "bills",
    "--limit",
    "2",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-bills",
  ]);
  assert.equal(cliBills.length, 2);

  const cliMaxSize = runCliJson([
    "account",
    "max-size",
    "--inst-id",
    "BTC-USDT",
    "--td-mode",
    "cash",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-max-size",
  ]);
  assert.equal(cliMaxSize.instId, "BTC-USDT");

  const cliFeeRates = runCliJson([
    "account",
    "fee-rates",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-fee-rates",
  ]);
  assert.equal(cliFeeRates.instId, "BTC-USDT");

  const cliPreview = runCliJson([
    "orders",
    "preview",
    "--inst-id",
    "BTC-USDT",
    "--side",
    "buy",
    "--type",
    "market",
    "--size",
    "0.001",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-preview",
  ]);
  assert.equal(cliPreview.ok, true);

  const cliOrder = runCliJson([
    "orders",
    "place",
    "--inst-id",
    "BTC-USDT",
    "--side",
    "buy",
    "--type",
    "limit",
    "--size",
    "0.01",
    "--price",
    "100",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-order",
  ]);
  assert.equal(cliOrder.state, "live");

  const cliOpenOrders = runCliJson([
    "orders",
    "open",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-open",
  ]);
  assert.equal(cliOpenOrders.length, 1);

  const cliOrderGet = runCliJson([
    "orders",
    "get",
    "--inst-id",
    "BTC-USDT",
    "--ord-id",
    cliOrder.ordId,
    "--env",
    "sandbox",
    "--source",
    "mock/cli-order-get",
  ]);
  assert.equal(cliOrderGet.ordId, cliOrder.ordId);

  const cliOrderAmended = runCliJson([
    "orders",
    "amend",
    "--inst-id",
    "BTC-USDT",
    "--ord-id",
    cliOrder.ordId,
    "--new-price",
    "101",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-order-amend",
  ]);
  assert.equal(cliOrderAmended.px, "101");

  const cliCanceled = runCliJson([
    "orders",
    "cancel",
    "--inst-id",
    "BTC-USDT",
    "--ord-id",
    cliOrder.ordId,
    "--env",
    "sandbox",
    "--source",
    "mock/cli-cancel",
  ]);
  assert.equal(cliCanceled.state, "canceled");

  const cliHistory = runCliJson([
    "orders",
    "history",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-history",
  ]);
  assert.ok(cliHistory.some((item) => item.ordId === cliOrder.ordId));

  const cliBatchOrders = [
    { instId: "BTC-USDT", side: "buy", ordType: "limit", sz: "0.01", px: "100" },
    { instId: "ETH-USDT", side: "buy", ordType: "limit", sz: "0.1", px: "10" },
  ];
  const cliBatchPlaced = runCliJson([
    "orders",
    "batch-place",
    "--orders-json",
    JSON.stringify(cliBatchOrders),
    "--env",
    "sandbox",
    "--source",
    "mock/cli-batch-place",
  ]);
  assert.equal(cliBatchPlaced.length, 2);

  const cliBatchAmended = runCliJson([
    "orders",
    "batch-amend",
    "--orders-json",
    JSON.stringify([
      { instId: "BTC-USDT", ordId: cliBatchPlaced[0].ordId, newPx: "102" },
      { instId: "ETH-USDT", ordId: cliBatchPlaced[1].ordId, newPx: "11" },
    ]),
    "--env",
    "sandbox",
    "--source",
    "mock/cli-batch-amend",
  ]);
  assert.equal(cliBatchAmended[0].px, "102");

  const cliBatchCanceled = runCliJson([
    "orders",
    "batch-cancel",
    "--orders-json",
    JSON.stringify([
      { instId: "BTC-USDT", ordId: cliBatchPlaced[0].ordId },
      { instId: "ETH-USDT", ordId: cliBatchPlaced[1].ordId },
    ]),
    "--env",
    "sandbox",
    "--source",
    "mock/cli-batch-cancel",
  ]);
  assert.equal(cliBatchCanceled[0].state, "canceled");

  const cliCancelAllAfter = runCliJson([
    "orders",
    "cancel-all-after",
    "--timeout",
    "30",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-cancel-all-after",
  ]);
  assert.equal(cliCancelAllAfter.timeOut, "30");

  const cliClosePosition = runCliJson([
    "orders",
    "close-position",
    "--inst-id",
    "BTC-USDT-SWAP",
    "--mgn-mode",
    "cross",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-close-position",
  ]);
  assert.equal(cliClosePosition.state, "closed");

  const cliAlgoOrder = runCliJson([
    "orders",
    "tp-sl",
    "--inst-id",
    "BTC-USDT",
    "--side",
    "sell",
    "--size",
    "0.01",
    "--tp-trigger-px",
    "70000",
    "--sl-trigger-px",
    "62000",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-place",
  ]);
  assert.equal(cliAlgoOrder.state, "live");
  assert.equal(cliAlgoOrder.ordType, "conditional");

  const cliOpenAlgoOrders = runCliJson([
    "orders",
    "algo-open",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-open",
  ]);
  assert.ok(cliOpenAlgoOrders.some((item) => item.algoId === cliAlgoOrder.algoId));

  const cliAlgoGet = runCliJson([
    "orders",
    "algo-get",
    "--inst-id",
    "BTC-USDT",
    "--algo-id",
    cliAlgoOrder.algoId,
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-get",
  ]);
  assert.equal(cliAlgoGet.algoId, cliAlgoOrder.algoId);

  const cliAlgoAmended = runCliJson([
    "orders",
    "algo-amend",
    "--inst-id",
    "BTC-USDT",
    "--algo-id",
    cliAlgoOrder.algoId,
    "--new-sl-trigger-px",
    "61000",
    "--new-sl-ord-px",
    "-1",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-amend",
  ]);
  assert.equal(cliAlgoAmended.slTriggerPx, "61000");

  const cliAlgoCanceled = runCliJson([
    "orders",
    "algo-cancel",
    "--inst-id",
    "BTC-USDT",
    "--algo-id",
    cliAlgoOrder.algoId,
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-cancel",
  ]);
  assert.equal(cliAlgoCanceled[0].state, "canceled");

  const cliAlgoHistory = runCliJson([
    "orders",
    "algo-history",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-algo-history",
  ]);
  assert.ok(cliAlgoHistory.some((item) => item.algoId === cliAlgoOrder.algoId));

  const cliStreamStart = runCliJson([
    "streams",
    "private-start",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-stream-start",
  ]);
  assert.equal(cliStreamStart.status, "active");

  const cliStreamStatus = runCliJson([
    "streams",
    "private-status",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-stream-status",
  ]);
  assert.equal(cliStreamStatus.status, "active");

  const cliStreamStop = runCliJson([
    "streams",
    "private-stop",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-stream-stop",
  ]);
  assert.equal(cliStreamStop.status, "stopped");

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

  const instruments = await okx.instruments.list({ instType: "SPOT", instId: "BTC-USDT" });
  assert.equal(instruments.length, 1);
  const instrument = await okx.instruments.get("BTC-USDT");
  assert.equal(instrument.instId, "BTC-USDT");

  const ticker = await okx.market.ticker("BTC-USDT");
  assert.equal(ticker.instId, "BTC-USDT");

  const candles = await okx.market.candles("BTC-USDT", { bar: "1m", limit: 3 });
  assert.equal(candles.length, 3);

  const books = await okx.market.books("BTC-USDT", { sz: 2 });
  assert.equal(books.asks.length, 2);

  const recentTrades = await okx.market.trades("BTC-USDT", { limit: 2 });
  assert.equal(recentTrades.length, 2);

  const tradeHistory = await okx.market.tradesHistory("BTC-USDT", { limit: 2 });
  assert.equal(tradeHistory.length, 2);

  const fundingRate = await okx.market.fundingRate("BTC-USDT-SWAP");
  assert.equal(fundingRate.instId, "BTC-USDT-SWAP");

  const fundingRateHistory = await okx.market.fundingRateHistory("BTC-USDT-SWAP", { limit: 2 });
  assert.equal(fundingRateHistory.length, 2);

  const openInterest = await okx.market.openInterest({ instId: "BTC-USDT-SWAP" });
  assert.equal(openInterest[0].instId, "BTC-USDT-SWAP");

  const markPrice = await okx.market.markPrice({ instId: "BTC-USDT-SWAP" });
  assert.equal(markPrice[0].instId, "BTC-USDT-SWAP");

  const indexTickers = await okx.market.indexTickers({ instId: "BTC-USDT" });
  assert.equal(indexTickers[0].instId, "BTC-USDT");

  const balance = await okx.account.balance();
  assert.ok(balance.details.some((item) => item.ccy === "USDT"));

  const available = await okx.account.available({ ccy: "USDT" });
  assert.equal(available.details[0].ccy, "USDT");

  const positions = await okx.account.positions();
  assert.ok(positions.some((item) => item.instId === "BTC-USDT"));

  const bills = await okx.account.bills({ limit: 2 });
  assert.equal(bills.length, 2);

  const maxSize = await okx.account.maxSize({ instId: "BTC-USDT" });
  assert.equal(maxSize.instId, "BTC-USDT");

  const maxAvailSize = await okx.account.maxAvailSize({ instId: "BTC-USDT" });
  assert.equal(maxAvailSize.instId, "BTC-USDT");

  const feeRates = await okx.account.feeRates({ instId: "BTC-USDT" });
  assert.equal(feeRates.instId, "BTC-USDT");

  const preview = await okx.orders.preview({
    instId: "BTC-USDT",
    side: "buy",
    ordType: "market",
    sz: "0.001",
  });
  assert.equal(preview.ok, true);

  const marketOrder = await okx.orders.placeMarketBuy("BTC-USDT", "0.001");
  assert.equal(marketOrder.state, "filled");

  await waitFor(() => events.some((event) => event.type === "order.update"));

  const fills = await okx.fills.list({ instId: "BTC-USDT", ordId: marketOrder.ordId });
  assert.equal(fills.length, 1);

  const fillsHistory = await okx.fills.history({ instId: "BTC-USDT", ordId: marketOrder.ordId });
  assert.equal(fillsHistory.length, 1);

  const streamStart = await okx.streams.private.start();
  assert.equal(streamStart.status, "active");
  await waitFor(() => events.some((event) => event.type === "okx.private.account"));
  const streamStatus = await okx.streams.private.status();
  assert.equal(streamStatus.status, "active");
  const streamStop = await okx.streams.private.stop();
  assert.equal(streamStop.status, "stopped");

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

  const protectiveAlgo = await okx.orders.placeTpSl({
    instId: "BTC-USDT",
    side: "sell",
    sz: "0.002",
    tpTriggerPx: "71000",
    slTriggerPx: "60000",
  });
  assert.equal(protectiveAlgo.state, "live");

  const sdkOpenAlgoOrders = await okx.orders.algo.open({ instId: "BTC-USDT" });
  assert.ok(sdkOpenAlgoOrders.some((item) => item.algoId === protectiveAlgo.algoId));

  const sdkFetchedAlgo = await okx.orders.algo.get({
    instId: "BTC-USDT",
    algoId: protectiveAlgo.algoId,
  });
  assert.equal(sdkFetchedAlgo.algoId, protectiveAlgo.algoId);

  const sdkAmendedAlgo = await okx.orders.algo.amend({
    instId: "BTC-USDT",
    algoId: protectiveAlgo.algoId,
    newSlTriggerPx: "59000",
    newSlOrdPx: "-1",
  });
  assert.equal(sdkAmendedAlgo.slTriggerPx, "59000");

  const sdkCanceledAlgo = await okx.orders.algo.cancel({
    instId: "BTC-USDT",
    algoId: protectiveAlgo.algoId,
  });
  assert.equal(sdkCanceledAlgo[0].state, "canceled");

  const sdkAlgoHistory = await okx.orders.algo.history({ instId: "BTC-USDT" });
  assert.ok(sdkAlgoHistory.some((item) => item.algoId === protectiveAlgo.algoId));

  const limitOrder = await okx.orders.place({
    instId: "BTC-USDT",
    side: "buy",
    ordType: "limit",
    sz: "0.01",
    px: "100",
  });
  assert.equal(limitOrder.state, "live");

  const fetchedLimitOrder = await okx.orders.get({ instId: "BTC-USDT", ordId: limitOrder.ordId });
  assert.equal(fetchedLimitOrder.ordId, limitOrder.ordId);

  const amendedLimitOrder = await okx.orders.amend({
    instId: "BTC-USDT",
    ordId: limitOrder.ordId,
    newPx: "103",
  });
  assert.equal(amendedLimitOrder.px, "103");

  const openOrders = await okx.orders.open({ instId: "BTC-USDT" });
  assert.equal(openOrders.length, 1);

  const canceled = await okx.orders.cancel({
    instId: "BTC-USDT",
    ordId: limitOrder.ordId,
  });
  assert.equal(canceled.state, "canceled");

  const history = await okx.orders.history({ instId: "BTC-USDT" });
  assert.ok(history.some((item) => item.ordId === limitOrder.ordId));

  const sdkBatchPlaced = await okx.orders.batch.place([
    { instId: "BTC-USDT", side: "buy", ordType: "limit", sz: "0.01", px: "100" },
    { instId: "ETH-USDT", side: "buy", ordType: "limit", sz: "0.1", px: "10" },
  ]);
  assert.equal(sdkBatchPlaced.length, 2);

  const sdkBatchAmended = await okx.orders.batch.amend([
    { instId: "BTC-USDT", ordId: sdkBatchPlaced[0].ordId, newPx: "104" },
    { instId: "ETH-USDT", ordId: sdkBatchPlaced[1].ordId, newPx: "12" },
  ]);
  assert.equal(sdkBatchAmended[0].px, "104");

  const sdkBatchCanceled = await okx.orders.batch.cancel([
    { instId: "BTC-USDT", ordId: sdkBatchPlaced[0].ordId },
    { instId: "ETH-USDT", ordId: sdkBatchPlaced[1].ordId },
  ]);
  assert.equal(sdkBatchCanceled[0].state, "canceled");

  const cancelAllAfter = await okx.orders.cancelAllAfter(0);
  assert.equal(cancelAllAfter.timeOut, "0");

  const closedPosition = await okx.orders.closePosition({
    instId: "BTC-USDT-SWAP",
    mgnMode: "cross",
  });
  assert.equal(closedPosition.state, "closed");

  const auditRecent = await okx.audit.recent({ limit: 20 });
  assert.ok(auditRecent.records.length > 0);

  const cliFills = runCliJson([
    "fills",
    "--inst-id",
    "BTC-USDT",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-fills",
  ]);
  assert.ok(cliFills.some((item) => item.ordId === marketOrder.ordId));

  const cliAudit = runCliJson([
    "audit",
    "recent",
    "--limit",
    "20",
    "--env",
    "sandbox",
    "--source",
    "mock/cli-audit",
  ]);
  assert.ok(cliAudit.records.length > 0);

  controller.abort();
  await eventPump;

  const auditRecords = readAuditRecords();
  const kinds = auditRecords.map((record) => record.kind);
  for (const required of [
    "state.get",
    "instruments.list",
    "instrument.get",
    "market.ticker",
    "market.candles",
    "market.books",
    "market.trades",
    "market.tradesHistory",
    "market.fundingRate",
    "market.fundingRateHistory",
    "market.openInterest",
    "market.markPrice",
    "market.indexTickers",
    "account.balance",
    "account.positions",
    "account.available",
    "account.bills",
    "account.maxSize",
    "account.maxAvailSize",
    "account.feeRates",
    "order.preview",
    "order.place",
    "order.get",
    "order.amend",
    "control.pause",
    "control.resume",
    "orders.open",
    "orders.history",
    "order.cancel",
    "orders.batch.place",
    "orders.batch.amend",
    "orders.batch.cancel",
    "order.cancelAllAfter",
    "position.close",
    "algo.open",
    "algo.history",
    "algo.get",
    "algo.place",
    "algo.amend",
    "algo.cancel",
    "fills.list",
    "fills.history",
    "stream.private.start",
    "stream.private.status",
    "stream.private.stop",
    "audit.recent",
  ]) {
    assert.ok(kinds.includes(required), `Missing audit kind: ${required}`);
  }
  assert.ok(auditRecords.some((record) => record.source === "mock/cli-order"));
  assert.ok(
    auditRecords.some(
      (record) => record.kind === "order.place" && record.error?.code === "DAEMON_PAUSED",
    ),
    "Missing paused write rejection audit record",
  );
  assert.ok(
    auditRecords.some(
      (record) => record.kind === "algo.place" && record.error?.code === "DAEMON_PAUSED",
    ),
    "Missing paused algo write rejection audit record",
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

function runCliJson(args) {
  return JSON.parse(runCli(args, { silent: true }));
}

function auditPath() {
  return path.join(workspace, "logs", "audit.jsonl");
}

function configureMockExchange() {
  const filePath = path.join(workspace, "okx.config.json");
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        ...config,
        exchange: "mock",
      },
      null,
      2,
    )}\n`,
  );
}

function assertWorkspaceBootstrapFiles() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.okx, "okx");
  assert.equal(packageJson.dependencies["okx-trader"], `^${rootPackageJson.version}`);

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
  await assert.rejects(
    () =>
      okx.orders.placeStopLoss({
        instId: "BTC-USDT",
        side: "sell",
        sz: "0.002",
        triggerPx: "58000",
      }),
    (error) => error.status === 423 && /paused/i.test(error.message),
  );
  await assert.rejects(
    () =>
      okx.orders.batch.place([
        { instId: "BTC-USDT", side: "buy", ordType: "limit", sz: "0.01", px: "100" },
      ]),
    (error) => error.status === 423 && /paused/i.test(error.message),
  );
  await assert.rejects(
    () => okx.orders.closePosition({ instId: "BTC-USDT-SWAP", mgnMode: "cross" }),
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
