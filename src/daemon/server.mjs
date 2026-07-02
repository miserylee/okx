import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createExchange } from "../exchange/index.mjs";
import { AuditLog, scrub } from "../lib/audit.mjs";
import { loadWorkspaceConfig, validateEnv } from "../lib/config.mjs";
import {
  ensureDir,
  readJsonFile,
  resolveWorkspace,
  VERSION,
  writeJsonFile,
} from "../lib/paths.mjs";
import { removeRegistry, writeRegistry } from "../lib/registry.mjs";

const WRITE_KINDS = new Set([
  "order.place",
  "order.amend",
  "order.cancel",
  "orders.batch.place",
  "orders.batch.amend",
  "orders.batch.cancel",
  "position.close",
  "algo.place",
  "algo.amend",
  "algo.cancel",
]);

export async function runDaemon({ workspace = process.cwd(), host = "127.0.0.1", port = 0 } = {}) {
  const root = resolveWorkspace(workspace);
  const config = loadWorkspaceConfig(root);
  const exchange = createExchange({ workspace: root, config });
  const audit = new AuditLog({ workspace: root, name: config.name });
  ensureDir(path.join(root, "runtime"));
  ensureDir(path.join(root, "logs"));

  let state = loadState(root);
  const subscribers = new Set();
  const privateStreams = new Map();
  let server;

  function registryEntry() {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    return {
      name: config.name,
      workspace: root,
      pid: process.pid,
      port: actualPort,
      baseUrl: `http://${host}:${actualPort}`,
      state,
      version: VERSION,
      startedAt,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  const startedAt = new Date().toISOString();

  async function setState(nextState, { reason, source = "daemon" } = {}) {
    state = nextState;
    saveState(root, state);
    writeRegistry(registryEntry());
    const type = state === "paused" ? "daemon.paused" : "daemon.resumed";
    emit(type, { source, data: { reason: reason || "" } });
  }

  async function selfPause(reason) {
    if (state !== "paused") {
      await setState("paused", { reason, source: "daemon" });
      emit("risk.event", { source: "daemon", data: { reason } });
    }
  }

  server = http.createServer(async (request, response) => {
    try {
      await handleRequest({
        request,
        response,
        root,
        config,
        exchange,
        audit,
        getState: () => state,
        setState,
        selfPause,
        emit,
        addSubscriber,
        privateStreams,
        shutdown,
      });
    } catch (error) {
      respondJson(response, 500, {
        ok: false,
        error: serializeError(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  writeRegistry(registryEntry());
  const heartbeat = setInterval(() => {
    try {
      writeRegistry(registryEntry());
    } catch {
      // If registry writes fail, health checks will reveal the stale daemon.
    }
  }, 5_000);

  process.on("SIGTERM", () => shutdown({ exit: true }));
  process.on("SIGINT", () => shutdown({ exit: true }));

  return new Promise((resolve) => {
    server.once("close", () => {
      clearInterval(heartbeat);
      removeRegistry(config.name);
      resolve();
    });
  });

  function emit(type, event = {}) {
    const payload = {
      type,
      timestamp: new Date().toISOString(),
      env: event.env ?? null,
      source: event.source || "daemon",
      data: event.data || {},
    };
    const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const subscriber of subscribers) {
      subscriber.write(frame);
    }
  }

  function addSubscriber(response) {
    subscribers.add(response);
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.write(
      `event: daemon.status\ndata: ${JSON.stringify({
        type: "daemon.status",
        timestamp: new Date().toISOString(),
        env: null,
        source: "daemon",
        data: { name: config.name, state },
      })}\n\n`,
    );
    response.on("close", () => subscribers.delete(response));
  }

  function shutdown({ exit = false } = {}) {
    for (const stream of privateStreams.values()) {
      stream.close();
    }
    privateStreams.clear();
    for (const subscriber of subscribers) {
      subscriber.end();
    }
    subscribers.clear();
    server.close(() => {
      removeRegistry(config.name);
      if (exit) process.exit(0);
    });
  }
}

async function handleRequest(ctx) {
  const { request, response, config, exchange, audit, getState, setState, selfPause, emit } = ctx;
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = url.pathname;
  const instrumentMatch = pathname.match(/^\/v1\/instruments\/([^/]+)$/);

  if (request.method === "GET" && pathname === "/v1/health") {
    return respondJson(response, 200, {
      ok: true,
      name: config.name,
      state: getState(),
      version: VERSION,
    });
  }

  if (request.method === "GET" && pathname === "/v1/events") {
    return ctx.addSubscriber(response);
  }

  if (request.method === "POST" && pathname === "/v1/internal/shutdown") {
    respondJson(response, 200, { ok: true });
    setTimeout(() => ctx.shutdown(), 20);
    return;
  }

  const body = await readJsonBody(request);
  const context = requestContext(request, body, url);

  if (request.method === "GET" && pathname === "/v1/state") {
    return audited(ctx, response, {
      kind: "state.get",
      context,
      requestSnapshot: {},
      operation: async () => ({ state: getState(), name: config.name, version: VERSION }),
    });
  }

  if (request.method === "POST" && pathname === "/v1/control/pause") {
    return audited(ctx, response, {
      kind: "control.pause",
      context,
      requestSnapshot: { reason: body.reason || "" },
      operation: async () => {
        await setState("paused", { reason: body.reason, source: context.source || "cli" });
        return { state: getState() };
      },
    });
  }

  if (request.method === "POST" && pathname === "/v1/control/resume") {
    return audited(ctx, response, {
      kind: "control.resume",
      context,
      requestSnapshot: { reason: body.reason || "" },
      operation: async () => {
        await setState("active", { reason: body.reason, source: context.source || "cli" });
        return { state: getState() };
      },
    });
  }

  if (request.method === "GET" && pathname === "/v1/instruments") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "instruments.list",
      context,
      requestSnapshot: query,
      operation: () => exchange.instruments({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && instrumentMatch) {
    requireContext(context);
    const instId = decodeURIComponent(instrumentMatch[1]);
    const instType = url.searchParams.get("instType") || "SPOT";
    return audited(ctx, response, {
      kind: "instrument.get",
      context,
      requestSnapshot: { instId, instType },
      operation: () => exchange.instrument({ env: context.env, instType, instId }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/ticker") {
    requireContext(context);
    const instId = requireQuery(url, "instId");
    return audited(ctx, response, {
      kind: "market.ticker",
      context,
      requestSnapshot: { instId },
      operation: () => exchange.ticker({ env: context.env, instId }),
      eventType: "market.ticker",
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/candles") {
    requireContext(context);
    const instId = requireQuery(url, "instId");
    const bar = url.searchParams.get("bar") || "1m";
    const limit = url.searchParams.get("limit") || "100";
    return audited(ctx, response, {
      kind: "market.candles",
      context,
      requestSnapshot: { instId, bar, limit },
      operation: () => exchange.candles({ env: context.env, instId, bar, limit }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/books") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.books",
      context,
      requestSnapshot: query,
      operation: () => exchange.books({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/trades") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.trades",
      context,
      requestSnapshot: query,
      operation: () => exchange.trades({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/trades-history") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.tradesHistory",
      context,
      requestSnapshot: query,
      operation: () => exchange.tradesHistory({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/funding-rate") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.fundingRate",
      context,
      requestSnapshot: query,
      operation: () => exchange.fundingRate({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/funding-rate-history") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.fundingRateHistory",
      context,
      requestSnapshot: query,
      operation: () => exchange.fundingRateHistory({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/open-interest") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.openInterest",
      context,
      requestSnapshot: query,
      operation: () => exchange.openInterest({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/mark-price") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.markPrice",
      context,
      requestSnapshot: query,
      operation: () => exchange.markPrice({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/market/index-tickers") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "market.indexTickers",
      context,
      requestSnapshot: query,
      operation: () => exchange.indexTickers({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/balance") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "account.balance",
      context,
      requestSnapshot: {},
      operation: () => exchange.balance({ env: context.env }),
      eventType: "account.balance",
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/positions") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.positions",
      context,
      requestSnapshot: query,
      operation: () => exchange.positions({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/available") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.available",
      context,
      requestSnapshot: query,
      operation: () => exchange.available({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/bills") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.bills",
      context,
      requestSnapshot: query,
      operation: () => exchange.bills({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/max-size") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.maxSize",
      context,
      requestSnapshot: query,
      operation: () => exchange.maxSize({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/max-avail-size") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.maxAvailSize",
      context,
      requestSnapshot: query,
      operation: () => exchange.maxAvailSize({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/account/fee-rates") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "account.feeRates",
      context,
      requestSnapshot: query,
      operation: () => exchange.feeRates({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/open") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "orders.open",
      context,
      requestSnapshot: query,
      operation: () => exchange.openOrders({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/history") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "orders.history",
      context,
      requestSnapshot: query,
      operation: () => exchange.orderHistory({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/get") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "order.get",
      context,
      requestSnapshot: query,
      operation: () => exchange.getOrder({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/algo/open") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "algo.open",
      context,
      requestSnapshot: query,
      operation: () => exchange.openAlgoOrders({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/algo/history") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "algo.history",
      context,
      requestSnapshot: query,
      operation: () => exchange.algoOrderHistory({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/orders/algo/get") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "algo.get",
      context,
      requestSnapshot: query,
      operation: () => exchange.getAlgoOrder({ env: context.env, ...query }),
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/preview") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "order.preview",
      context,
      requestSnapshot: body,
      operation: () => exchange.previewOrder({ env: context.env, ...body }),
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/place") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "order.place",
      context,
      requestSnapshot: body,
      operation: () => exchange.placeOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/amend") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "order.amend",
      context,
      requestSnapshot: body,
      operation: () => exchange.amendOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/cancel") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "order.cancel",
      context,
      requestSnapshot: body,
      operation: () => exchange.cancelOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/batch/place") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "orders.batch.place",
      context,
      requestSnapshot: body,
      operation: () => exchange.placeBatchOrders({ env: context.env, orders: body.orders || [] }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/batch/amend") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "orders.batch.amend",
      context,
      requestSnapshot: body,
      operation: () => exchange.amendBatchOrders({ env: context.env, orders: body.orders || [] }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/batch/cancel") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "orders.batch.cancel",
      context,
      requestSnapshot: body,
      operation: () => exchange.cancelBatchOrders({ env: context.env, orders: body.orders || [] }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/cancel-all-after") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "order.cancelAllAfter",
      context,
      requestSnapshot: body,
      operation: () => exchange.cancelAllAfter({ env: context.env, ...body }),
      eventType: "risk.event",
    });
  }

  if (request.method === "POST" && pathname === "/v1/positions/close") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "position.close",
      context,
      requestSnapshot: body,
      operation: () => exchange.closePosition({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/algo/place") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "algo.place",
      context,
      requestSnapshot: body,
      operation: () => exchange.placeAlgoOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/algo/amend") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "algo.amend",
      context,
      requestSnapshot: body,
      operation: () => exchange.amendAlgoOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "POST" && pathname === "/v1/orders/algo/cancel") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "algo.cancel",
      context,
      requestSnapshot: body,
      operation: () => exchange.cancelAlgoOrder({ env: context.env, ...body }),
      eventType: "order.update",
    });
  }

  if (request.method === "GET" && pathname === "/v1/fills") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "fills.list",
      context,
      requestSnapshot: query,
      operation: () => exchange.fills({ env: context.env, ...query }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/fills/history") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "fills.history",
      context,
      requestSnapshot: query,
      operation: () => exchange.fillsHistory({ env: context.env, ...query }),
    });
  }

  if (request.method === "POST" && pathname === "/v1/streams/private/start") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "stream.private.start",
      context,
      requestSnapshot: body,
      operation: () => startPrivateStream(ctx, context, body),
      resultSnapshot: (result) => ({
        env: result.env,
        status: result.status,
        channels: result.channels,
        startedAt: result.startedAt,
      }),
    });
  }

  if (request.method === "GET" && pathname === "/v1/streams/private/status") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "stream.private.status",
      context,
      requestSnapshot: {},
      operation: async () => privateStreamStatus(ctx, context.env),
    });
  }

  if (request.method === "POST" && pathname === "/v1/streams/private/stop") {
    requireContext(context);
    return audited(ctx, response, {
      kind: "stream.private.stop",
      context,
      requestSnapshot: {},
      operation: async () => stopPrivateStream(ctx, context.env),
    });
  }

  if (request.method === "GET" && pathname === "/v1/audit/recent") {
    requireContext(context);
    const query = Object.fromEntries(url.searchParams);
    return audited(ctx, response, {
      kind: "audit.recent",
      context,
      requestSnapshot: query,
      operation: async () => ({
        records: audit.recent({
          limit: query.limit,
          kind: query.kind,
          source: query.source,
          env: query.recordEnv,
        }),
      }),
      resultSnapshot: (result) => ({ count: result.records.length }),
    });
  }

  respondJson(response, 404, {
    ok: false,
    error: { code: "NOT_FOUND", message: `${request.method} ${pathname} not found` },
  });

  async function audited(ctx, response, options) {
    return auditedOperation({
      ...ctx,
      response,
      ...options,
      state: getState(),
      selfPause,
      emit,
    });
  }
}

async function startPrivateStream(ctx, context, body) {
  const key = context.env;
  const current = ctx.privateStreams.get(key);
  if (current && !["closed", "error"].includes(current.status().status)) {
    return current.status();
  }

  const stream = ctx.exchange.createPrivateStream({
    env: context.env,
    channels: normalizePrivateChannels(body.channels),
    onEvent: (type, data) => ctx.emit(type, { env: context.env, source: context.source, data }),
  });
  ctx.privateStreams.set(key, stream);
  return stream.status();
}

async function stopPrivateStream(ctx, env) {
  const current = ctx.privateStreams.get(env);
  if (!current) return { env, status: "stopped" };
  current.close();
  ctx.privateStreams.delete(env);
  return { env, status: "stopped" };
}

async function privateStreamStatus(ctx, env) {
  const current = ctx.privateStreams.get(env);
  if (!current) return { env, status: "stopped" };
  return current.status();
}

function normalizePrivateChannels(channels) {
  if (!channels) return undefined;
  if (!Array.isArray(channels)) {
    throw new Error("channels must be an array");
  }
  return channels;
}

async function auditedOperation({
  response,
  audit,
  state,
  selfPause,
  emit,
  kind,
  context,
  requestSnapshot,
  operation,
  eventType,
  resultSnapshot,
}) {
  const started = Date.now();
  const isWrite = WRITE_KINDS.has(kind);
  if (isWrite && state === "paused") {
    const error = {
      code: "DAEMON_PAUSED",
      message: "Daemon is paused; trading writes are rejected",
    };
    appendAuditOrPause({
      audit,
      selfPause,
      record: auditRecord({
        kind,
        context,
        requestSnapshot,
        result: null,
        error,
        latencyMs: Date.now() - started,
      }),
    });
    return respondJson(response, 423, { ok: false, error });
  }

  try {
    const result = await operation();
    appendAuditOrPause({
      audit,
      selfPause,
      record: auditRecord({
        kind,
        context,
        requestSnapshot,
        result: resultSnapshot ? resultSnapshot(result) : result,
        error: null,
        latencyMs: Date.now() - started,
      }),
    });
    if (eventType) emit(eventType, { env: context.env, source: context.source, data: result });
    return respondJson(response, 200, { ok: true, data: result });
  } catch (error) {
    const serialized = serializeError(error);
    appendAuditOrPause({
      audit,
      selfPause,
      record: auditRecord({
        kind,
        context,
        requestSnapshot,
        result: null,
        error: serialized,
        latencyMs: Date.now() - started,
      }),
    });
    return respondJson(response, error.status || 500, { ok: false, error: serialized });
  }
}

function appendAuditOrPause({ audit, selfPause, record }) {
  try {
    audit.append(record);
  } catch (error) {
    selfPause(`audit log write failure: ${error.message}`);
    throw error;
  }
}

function auditRecord({ kind, context, requestSnapshot, result, error, latencyMs }) {
  return {
    env: context.env ?? null,
    source: context.source || "unknown",
    kind,
    method: kindToMethod(kind),
    path: kindToPath(kind),
    request: scrub(requestSnapshot || {}),
    result: scrub(result),
    error,
    latencyMs,
  };
}

function kindToMethod(kind) {
  if (kind === "order.get") return "GET";
  if (
    kind.startsWith("order.") ||
    kind.startsWith("control.") ||
    kind.startsWith("position.") ||
    [
      "algo.place",
      "algo.amend",
      "algo.cancel",
      "orders.batch.place",
      "orders.batch.amend",
      "orders.batch.cancel",
      "stream.private.start",
      "stream.private.stop",
    ].includes(kind)
  ) {
    return "POST";
  }
  return "GET";
}

function kindToPath(kind) {
  return {
    "state.get": "/v1/state",
    "control.pause": "/v1/control/pause",
    "control.resume": "/v1/control/resume",
    "instruments.list": "/v1/instruments",
    "instrument.get": "/v1/instruments/:instId",
    "market.ticker": "/v1/market/ticker",
    "market.candles": "/v1/market/candles",
    "market.books": "/v1/market/books",
    "market.trades": "/v1/market/trades",
    "market.tradesHistory": "/v1/market/trades-history",
    "market.fundingRate": "/v1/market/funding-rate",
    "market.fundingRateHistory": "/v1/market/funding-rate-history",
    "market.openInterest": "/v1/market/open-interest",
    "market.markPrice": "/v1/market/mark-price",
    "market.indexTickers": "/v1/market/index-tickers",
    "account.balance": "/v1/account/balance",
    "account.positions": "/v1/account/positions",
    "account.available": "/v1/account/available",
    "account.bills": "/v1/account/bills",
    "account.maxSize": "/v1/account/max-size",
    "account.maxAvailSize": "/v1/account/max-avail-size",
    "account.feeRates": "/v1/account/fee-rates",
    "orders.open": "/v1/orders/open",
    "orders.history": "/v1/orders/history",
    "order.get": "/v1/orders/get",
    "order.preview": "/v1/orders/preview",
    "order.place": "/v1/orders/place",
    "order.amend": "/v1/orders/amend",
    "order.cancel": "/v1/orders/cancel",
    "orders.batch.place": "/v1/orders/batch/place",
    "orders.batch.amend": "/v1/orders/batch/amend",
    "orders.batch.cancel": "/v1/orders/batch/cancel",
    "order.cancelAllAfter": "/v1/orders/cancel-all-after",
    "position.close": "/v1/positions/close",
    "algo.open": "/v1/orders/algo/open",
    "algo.history": "/v1/orders/algo/history",
    "algo.get": "/v1/orders/algo/get",
    "algo.place": "/v1/orders/algo/place",
    "algo.amend": "/v1/orders/algo/amend",
    "algo.cancel": "/v1/orders/algo/cancel",
    "fills.list": "/v1/fills",
    "fills.history": "/v1/fills/history",
    "stream.private.start": "/v1/streams/private/start",
    "stream.private.status": "/v1/streams/private/status",
    "stream.private.stop": "/v1/streams/private/stop",
    "audit.recent": "/v1/audit/recent",
  }[kind];
}

function requestContext(request, body, url) {
  const env = header(request, "x-okx-env") || body.env || url.searchParams.get("env") || null;
  const source =
    header(request, "x-okx-source") || body.source || url.searchParams.get("source") || "unknown";
  return { env, source };
}

function requireContext(context) {
  validateEnv(context.env);
  if (!context.source || context.source === "unknown") {
    throw new Error("source is required");
  }
}

function requireQuery(url, name) {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter: ${name}`);
  return value;
}

function header(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON request body: ${text.slice(0, 120)}`);
  }
}

function respondJson(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function serializeError(error) {
  return {
    code: error.code || "ERROR",
    message: error.message || String(error),
  };
}

function loadState(workspace) {
  const filePath = statePath(workspace);
  if (!fs.existsSync(filePath)) return "active";
  const state = readJsonFile(filePath).state;
  return state === "paused" ? "paused" : "active";
}

function saveState(workspace, state) {
  writeJsonFile(statePath(workspace), { state, updatedAt: new Date().toISOString() });
}

function statePath(workspace) {
  return path.join(workspace, "runtime", "state.json");
}
