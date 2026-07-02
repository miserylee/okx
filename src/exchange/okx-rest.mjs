import crypto from "node:crypto";
import { credentialPath } from "../lib/config.mjs";
import { parseEnvFile } from "../lib/env.mjs";
import { configureUndiciProxy } from "../lib/proxy.mjs";

const DEFAULT_REST_BASE_URL = "https://www.okx.com";

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

  async cancelOrder({ env, ...order }) {
    return this.okxRequest({
      env,
      method: "POST",
      pathname: "/api/v5/trade/cancel-order",
      body: order,
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
