import { readRegistry } from "../lib/registry.mjs";
import { validateEnv } from "../lib/config.mjs";

export async function connectOkxDaemon(name, { env, source, timeoutMs = 5_000 } = {}) {
  validateEnv(env);
  if (!source) throw new Error("source is required when connecting to the OKX daemon");

  const registry = readRegistry(name);
  if (!registry?.baseUrl) {
    throw new Error(`No daemon registry found for ${name}`);
  }

  const client = new OkxDaemonClient({ name, env, source, baseUrl: registry.baseUrl, timeoutMs });
  await client.health();
  return client;
}

export class OkxDaemonClient {
  constructor({ name, env, source, baseUrl, timeoutMs }) {
    this.name = name;
    this.env = env;
    this.source = source;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;

    this.instruments = {
      list: (query = {}) => this.request("GET", "/v1/instruments", { query }),
      get: (instId, query = {}) =>
        this.request("GET", `/v1/instruments/${encodeURIComponent(instId)}`, { query }),
    };
    this.market = {
      ticker: (instId) => this.request("GET", "/v1/market/ticker", { query: { instId } }),
      candles: (instId, options = {}) =>
        this.request("GET", "/v1/market/candles", { query: { instId, ...options } }),
    };
    this.account = {
      balance: () => this.request("GET", "/v1/account/balance"),
      positions: (query = {}) => this.request("GET", "/v1/account/positions", { query }),
      available: (query = {}) => this.request("GET", "/v1/account/available", { query }),
    };
    this.orders = {
      open: (query = {}) => this.request("GET", "/v1/orders/open", { query }),
      history: (query = {}) => this.request("GET", "/v1/orders/history", { query }),
      preview: (order) => this.request("POST", "/v1/orders/preview", { body: order }),
      place: (order) => this.request("POST", "/v1/orders/place", { body: order }),
      cancel: (order) => this.request("POST", "/v1/orders/cancel", { body: order }),
      algo: {
        open: (query = {}) => this.request("GET", "/v1/orders/algo/open", { query }),
        history: (query = {}) => this.request("GET", "/v1/orders/algo/history", { query }),
        get: (query = {}) => this.request("GET", "/v1/orders/algo/get", { query }),
        place: (order) => this.request("POST", "/v1/orders/algo/place", { body: order }),
        amend: (order) => this.request("POST", "/v1/orders/algo/amend", { body: order }),
        cancel: (order) => this.request("POST", "/v1/orders/algo/cancel", { body: order }),
      },
      placeMarketBuy: (instId, amount, extra = {}) =>
        this.request("POST", "/v1/orders/place", {
          body: { instId, side: "buy", ordType: "market", sz: amount, ...extra },
        }),
      placeTakeProfit: (order) =>
        this.request("POST", "/v1/orders/algo/place", {
          body: buildTakeProfitAlgoOrder(order),
        }),
      placeStopLoss: (order) =>
        this.request("POST", "/v1/orders/algo/place", {
          body: buildStopLossAlgoOrder(order),
        }),
      placeTpSl: (order) =>
        this.request("POST", "/v1/orders/algo/place", {
          body: buildTpSlAlgoOrder(order),
        }),
    };
    this.control = {
      pause: (reason = "") => this.request("POST", "/v1/control/pause", { body: { reason } }),
      resume: (reason = "") => this.request("POST", "/v1/control/resume", { body: { reason } }),
    };
    this.fills = {
      list: (query = {}) => this.request("GET", "/v1/fills", { query }),
    };
    this.audit = {
      recent: (query = {}) => this.request("GET", "/v1/audit/recent", { query }),
    };
    this.events = {
      subscribe: (onEvent, options = {}) => this.subscribe(onEvent, options),
    };
  }

  async health() {
    return this.request("GET", "/v1/health", { unwrap: false, context: false });
  }

  async state() {
    return this.request("GET", "/v1/state");
  }

  async request(method, pathname, { query = {}, body, unwrap = true, context = true } = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {};
      if (context) {
        headers["x-okx-env"] = this.env;
        headers["x-okx-source"] = this.source;
      }
      if (body) headers["Content-Type"] = "application/json";
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.error?.message || response.statusText);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return unwrap && Object.hasOwn(payload, "data") ? payload.data : payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async subscribe(onEvent, { signal } = {}) {
    const response = await fetch(`${this.baseUrl}/v1/events`, {
      headers: {
        "x-okx-env": this.env,
        "x-okx-source": this.source,
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`SSE subscribe failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = parseSseFrame(frame);
          if (event) onEvent(event);
        }
      }
    } catch (error) {
      if (signal?.aborted) return;
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
}

function parseSseFrame(frame) {
  let type = "message";
  let data = "";
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) type = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data += line.slice("data:".length).trim();
  }
  if (!data) return null;
  return { type, ...JSON.parse(data) };
}

function buildTakeProfitAlgoOrder(order = {}) {
  const { triggerPx, orderPx = "-1", ...rest } = order;
  return {
    ...rest,
    ordType: rest.ordType || "conditional",
    tpTriggerPx: rest.tpTriggerPx || triggerPx,
    tpOrdPx: rest.tpOrdPx || orderPx,
  };
}

function buildStopLossAlgoOrder(order = {}) {
  const { triggerPx, orderPx = "-1", ...rest } = order;
  return {
    ...rest,
    ordType: rest.ordType || "conditional",
    slTriggerPx: rest.slTriggerPx || triggerPx,
    slOrdPx: rest.slOrdPx || orderPx,
  };
}

function buildTpSlAlgoOrder(order = {}) {
  return {
    ...order,
    ordType: order.ordType || "conditional",
    tpOrdPx: order.tpOrdPx || "-1",
    slOrdPx: order.slOrdPx || "-1",
  };
}
