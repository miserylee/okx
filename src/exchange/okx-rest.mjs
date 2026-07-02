import crypto from "node:crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { credentialPath } from "../lib/config.mjs";
import { parseEnvFile } from "../lib/env.mjs";
import { configureUndiciProxy } from "../lib/proxy.mjs";

const DEFAULT_REST_BASE_URL = "https://www.okx.com";
const DEFAULT_WS_PRIVATE_BASE_URL = "wss://ws.okx.com:8443/ws/v5/private";
const DEFAULT_WS_PRIVATE_SANDBOX_BASE_URL = "wss://wspap.okx.com:8443/ws/v5/private";

export class OkxRestExchange {
  constructor({ workspace, config }) {
    this.workspace = workspace;
    this.config = config;
    this.baseUrl = process.env.OKX_REST_BASE_URL || DEFAULT_REST_BASE_URL;
    configureUndiciProxy();
  }

  async ticker({ env, instId }) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/ticker",
      query: { instId },
      privateRequest: false,
    }).then((payload) => payload.data?.[0] || null);
  }

  async candles({ env, instId, bar = "1m", limit = 100 }) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/candles",
      query: { instId, bar, limit },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async books({ env, instId, sz } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/books",
      query: { instId, sz },
      privateRequest: false,
    }).then((payload) => payload.data?.[0] || null);
  }

  async trades({ env, instId, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/trades",
      query: { instId, limit },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async tradesHistory({ env, instId, type, after, before, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/history-trades",
      query: { instId, type, after, before, limit },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async fundingRate({ env, instId } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/public/funding-rate",
      query: { instId },
      privateRequest: false,
    }).then((payload) => payload.data?.[0] || null);
  }

  async fundingRateHistory({ env, instId, after, before, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/public/funding-rate-history",
      query: { instId, after, before, limit },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async openInterest({ env, instType = "SWAP", instId, uly, instFamily } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/public/open-interest",
      query: { instType, instId, uly, instFamily },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async markPrice({ env, instType = "SWAP", instId, uly, instFamily } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/public/mark-price",
      query: { instType, instId, uly, instFamily },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async indexTickers({ env, quoteCcy, instId } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/market/index-tickers",
      query: { quoteCcy, instId },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async instruments({ env, instType = "SPOT", instId, uly, instFamily } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/public/instruments",
      query: { instType, instId, uly, instFamily },
      privateRequest: false,
    }).then((payload) => payload.data || []);
  }

  async instrument({ env, instType = "SPOT", instId }) {
    return this.instruments({ env, instType, instId }).then(
      (items) => items.find((item) => item.instId === instId) || null,
    );
  }

  async balance({ env }) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/balance",
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async available({ env, ccy } = {}) {
    const balance = await this.balance({ env });
    return availableFromBalance(balance, { ccy });
  }

  async positions({ env, instType, instId, posId } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/positions",
      query: { instType, instId, posId },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async bills({
    env,
    instType,
    ccy,
    mgnMode,
    ctType,
    type,
    subType,
    after,
    before,
    limit,
  } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/bills",
      query: { instType, ccy, mgnMode, ctType, type, subType, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async maxSize({ env, instId, tdMode = "cash", ccy, px, leverage, unSpotOffset } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/max-size",
      query: { instId, tdMode, ccy, px, leverage, unSpotOffset },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || null);
  }

  async maxAvailSize({
    env,
    instId,
    tdMode = "cash",
    ccy,
    reduceOnly,
    unSpotOffset,
    quickMgnType,
  } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/max-avail-size",
      query: { instId, tdMode, ccy, reduceOnly, unSpotOffset, quickMgnType },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || null);
  }

  async feeRates({ env, instType = "SPOT", instId, uly, instFamily } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/account/trade-fee",
      query: { instType, instId, uly, instFamily },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || null);
  }

  async openOrders({ env, instType = "SPOT", instId } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/orders-pending",
      query: { instType, instId },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async orderHistory({ env, instType = "SPOT", instId, state, after, before, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/orders-history",
      query: { instType, instId, state, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async getOrder({ env, instId, ordId, clOrdId } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/order",
      query: { instId, ordId, clOrdId },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async openAlgoOrders({
    env,
    instType,
    instId,
    ordType = "conditional",
    algoId,
    algoClOrdId,
    after,
    before,
    limit,
  } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/orders-algo-pending",
      query: { instType, instId, ordType, algoId, algoClOrdId, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async algoOrderHistory({
    env,
    instType,
    instId,
    ordType = "conditional",
    state,
    algoId,
    algoClOrdId,
    after,
    before,
    limit,
  } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/orders-algo-history",
      query: { instType, instId, ordType, state, algoId, algoClOrdId, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async getAlgoOrder({ env, instId, algoId, algoClOrdId, ordType = "conditional" } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/order-algo",
      query: { instId, algoId, algoClOrdId, ordType },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async fills({ env, instType, instId, ordId, after, before, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/fills",
      query: { instType, instId, ordId, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async fillsHistory({ env, instType, instId, ordId, after, before, limit } = {}) {
    return this.okxGet({
      env,
      pathname: "/api/v5/trade/fills-history",
      query: { instType, instId, ordId, after, before, limit },
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async previewOrder({ env, ...order }) {
    const body = {
      tdMode: order.tdMode || "cash",
      ...order,
    };
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/order-precheck",
      body,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || []);
  }

  async placeOrder({ env, ...order }) {
    const body = {
      tdMode: order.tdMode || "cash",
      ...order,
    };
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/order",
      body,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async amendOrder({ env, ...order }) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/amend-order",
      body: order,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async cancelOrder({ env, ...order }) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/cancel-order",
      body: order,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async placeBatchOrders({ env, orders = [] } = {}) {
    const body = orders.map((order) => ({
      tdMode: order.tdMode || "cash",
      ...order,
    }));
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/batch-orders",
      body,
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async amendBatchOrders({ env, orders = [] } = {}) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/amend-batch-orders",
      body: orders,
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async cancelBatchOrders({ env, orders = [] } = {}) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/cancel-batch-orders",
      body: orders,
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  async cancelAllAfter({ env, timeOut } = {}) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/cancel-all-after",
      body: { timeOut },
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || null);
  }

  async closePosition({ env, ...position }) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/close-position",
      body: position,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async placeAlgoOrder({ env, ...order }) {
    const body = {
      tdMode: order.tdMode || "cash",
      ...order,
    };
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/order-algo",
      body,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || null);
  }

  async amendAlgoOrder({ env, ...order }) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/amend-algos",
      body: order,
      privateRequest: true,
    }).then((payload) => payload.data?.[0] || payload.data || null);
  }

  async cancelAlgoOrder({ env, orders, ...order }) {
    const body = Array.isArray(orders) ? orders : [order];
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/cancel-algos",
      body,
      privateRequest: true,
    }).then((payload) => payload.data || []);
  }

  createPrivateStream({ env, channels = defaultPrivateChannels(), onEvent }) {
    const credentials = this.loadCredentials(env);
    const proxyUrl = configureUndiciProxy();
    const wsUrl =
      process.env.OKX_WS_PRIVATE_BASE_URL ||
      (env === "sandbox" ? DEFAULT_WS_PRIVATE_SANDBOX_BASE_URL : DEFAULT_WS_PRIVATE_BASE_URL);
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
    const ws = new WebSocket(wsUrl, agent ? { agent } : undefined);
    const startedAt = new Date().toISOString();
    let status = "connecting";
    let lastEventAt = null;
    let lastError = null;

    ws.on("open", () => {
      status = "authenticating";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      ws.send(
        JSON.stringify({
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
        }),
      );
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        onEvent?.("okx.private.raw", { text });
        return;
      }
      lastEventAt = new Date().toISOString();

      if (payload.event === "login") {
        if (payload.code === "0") {
          status = "subscribing";
          ws.send(JSON.stringify({ op: "subscribe", args: channels }));
        } else {
          status = "error";
          lastError = payload;
        }
        onEvent?.("okx.private.login", payload);
        return;
      }

      if (payload.event === "subscribe") {
        status = "active";
        onEvent?.("okx.private.subscribe", payload);
        return;
      }

      if (payload.event === "error") {
        status = "error";
        lastError = payload;
        onEvent?.("okx.private.error", payload);
        return;
      }

      const channel = payload.arg?.channel || "message";
      onEvent?.(`okx.private.${channel}`, payload);
    });

    ws.on("error", (error) => {
      status = "error";
      lastError = { message: error.message };
      onEvent?.("okx.private.error", { message: error.message });
    });

    ws.on("close", (code, reason) => {
      status = "closed";
      onEvent?.("okx.private.close", { code, reason: reason.toString() });
    });

    return {
      close() {
        status = "closing";
        ws.close();
      },
      status() {
        return {
          env,
          status,
          wsUrl,
          channels,
          startedAt,
          lastEventAt,
          lastError,
        };
      },
    };
  }

  async okxGet(options) {
    return this.okxRequest({ ...options, method: "GET" });
  }

  async okxRequest({ env, method, pathname, query = {}, body, privateRequest }) {
    const requestPath = buildRequestPath(pathname, query);
    const bodyText = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
    };

    if (env === "sandbox") {
      headers["x-simulated-trading"] = "1";
    }

    if (privateRequest) {
      const credentials = this.loadCredentials(env);
      Object.assign(
        headers,
        restHeaders({
          credentials,
          method,
          requestPath,
          body: bodyText,
        }),
      );
    }

    const response = await fetch(`${trimTrailingSlash(this.baseUrl)}${requestPath}`, {
      method,
      headers,
      body: bodyText || undefined,
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`OKX ${requestPath} returned non-JSON response: ${text}`);
    }

    if (!response.ok) {
      throw new Error(`OKX ${requestPath} HTTP ${response.status}: ${text}`);
    }
    if (payload.code !== "0") {
      throw new Error(`OKX ${requestPath} code ${payload.code}: ${payload.msg || ""}`);
    }
    return payload;
  }

  loadCredentials(env) {
    const filePath = credentialPath(this.workspace, this.config, env);
    const fileEnv = parseEnvFile(filePath);
    const merged = { ...fileEnv, ...process.env };
    const apiKey = merged.OKX_API_KEY?.trim();
    const secretKey = merged.OKX_SECRET_KEY?.trim();
    const passphrase = merged.OKX_PASSPHRASE?.trim();
    const missing = [];
    if (!apiKey) missing.push("OKX_API_KEY");
    if (!secretKey) missing.push("OKX_SECRET_KEY");
    if (!passphrase) missing.push("OKX_PASSPHRASE");
    if (missing.length > 0) {
      throw new Error(`Missing credentials in ${filePath}: ${missing.join(", ")}`);
    }
    return { apiKey, secretKey, passphrase };
  }
}

function restHeaders({ credentials, method, requestPath, body }) {
  const timestamp = new Date().toISOString();
  return {
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
}

function sign({ timestamp, method, requestPath, body = "", secretKey }) {
  return crypto
    .createHmac("sha256", secretKey)
    .update(`${timestamp}${method.toUpperCase()}${requestPath}${body}`)
    .digest("base64");
}

function buildRequestPath(pathname, query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") search.set(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function defaultPrivateChannels() {
  return [
    { channel: "account" },
    { channel: "positions", instType: "ANY" },
    { channel: "orders", instType: "ANY" },
    { channel: "orders-algo", instType: "ANY" },
  ];
}

function availableFromBalance(balance, { ccy } = {}) {
  const details = (balance?.details || [])
    .filter((item) => !ccy || item.ccy === ccy)
    .map((item) => ({
      ccy: item.ccy,
      availBal: item.availBal,
      availEq: item.availEq,
      cashBal: item.cashBal,
      eq: item.eq,
      eqUsd: item.eqUsd,
      frozenBal: item.frozenBal,
      ordFrozen: item.ordFrozen,
    }));
  return {
    totalEq: balance?.totalEq ?? null,
    details,
  };
}
