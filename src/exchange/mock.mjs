export class MockExchange {
  constructor() {
    this.nextOrderId = 1;
    this.nextAlgoId = 1;
    this.orders = [];
    this.algoOrders = [];
    this.fillsLog = [];
    this.instrumentsList = [
      {
        instType: "SPOT",
        instId: "BTC-USDT",
        baseCcy: "BTC",
        quoteCcy: "USDT",
        tickSz: "0.1",
        lotSz: "0.00000001",
        minSz: "0.00001",
        state: "live",
      },
      {
        instType: "SPOT",
        instId: "ETH-USDT",
        baseCcy: "ETH",
        quoteCcy: "USDT",
        tickSz: "0.01",
        lotSz: "0.000001",
        minSz: "0.0001",
        state: "live",
      },
    ];
  }

  async ticker({ instId }) {
    return {
      instId,
      last: "65000.1",
      bidPx: "64999.9",
      askPx: "65000.2",
      ts: String(Date.now()),
    };
  }

  async candles({ instId, bar = "1m", limit = 10 }) {
    const count = Math.max(1, Math.min(Number(limit) || 10, 100));
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => ({
      instId,
      bar,
      ts: String(now - index * 60_000),
      open: "65000",
      high: "65100",
      low: "64900",
      close: String(65000 + index),
      volume: String(10 + index),
    }));
  }

  async books({ instId, sz = 5 } = {}) {
    const count = Math.max(1, Math.min(Number(sz) || 5, 50));
    return {
      instId,
      asks: Array.from({ length: count }, (_, index) => [
        String(65001 + index),
        String(0.5 + index / 10),
        "0",
        "1",
      ]),
      bids: Array.from({ length: count }, (_, index) => [
        String(64999 - index),
        String(0.4 + index / 10),
        "0",
        "1",
      ]),
      ts: String(Date.now()),
    };
  }

  async trades({ instId, limit = 10 } = {}) {
    const count = Math.max(1, Math.min(Number(limit) || 10, 100));
    return Array.from({ length: count }, (_, index) => ({
      instId,
      tradeId: `trade-${index + 1}`,
      px: String(65000 + index),
      sz: "0.01",
      side: index % 2 === 0 ? "buy" : "sell",
      ts: String(Date.now() - index * 1000),
    }));
  }

  async tradesHistory(query = {}) {
    return this.trades(query);
  }

  async fundingRate({ instId } = {}) {
    return {
      instId,
      fundingRate: "0.0001",
      nextFundingRate: "0.00011",
      fundingTime: String(Date.now() + 8 * 60 * 60 * 1000),
      ts: String(Date.now()),
    };
  }

  async fundingRateHistory({ instId, limit = 3 } = {}) {
    const count = Math.max(1, Math.min(Number(limit) || 3, 100));
    return Array.from({ length: count }, (_, index) => ({
      instId,
      fundingRate: String(0.0001 - index * 0.00001),
      fundingTime: String(Date.now() - index * 8 * 60 * 60 * 1000),
    }));
  }

  async openInterest({ instType = "SWAP", instId } = {}) {
    return [
      {
        instType,
        instId: instId || "BTC-USDT-SWAP",
        oi: "12345",
        oiCcy: "BTC",
        ts: String(Date.now()),
      },
    ];
  }

  async markPrice({ instType = "SWAP", instId } = {}) {
    return [
      {
        instType,
        instId: instId || "BTC-USDT-SWAP",
        markPx: "65000.5",
        ts: String(Date.now()),
      },
    ];
  }

  async indexTickers({ instId } = {}) {
    return [
      {
        instId: instId || "BTC-USDT",
        idxPx: "65000.3",
        high24h: "66000",
        low24h: "64000",
        ts: String(Date.now()),
      },
    ];
  }

  async balance() {
    return {
      totalEq: "100000",
      details: [
        {
          ccy: "USDT",
          availBal: "100000",
          cashBal: "100000",
        },
        {
          ccy: "BTC",
          availBal: "1",
          cashBal: "1",
        },
      ],
    };
  }

  async available({ ccy } = {}) {
    const balance = await this.balance();
    return {
      totalEq: balance.totalEq,
      details: balance.details
        .filter((item) => !ccy || item.ccy === ccy)
        .map((item) => ({
          ccy: item.ccy,
          availBal: item.availBal,
          cashBal: item.cashBal,
        })),
    };
  }

  async instruments({ instType = "SPOT", instId } = {}) {
    return this.instrumentsList.filter(
      (item) => item.instType === instType && (!instId || item.instId === instId),
    );
  }

  async instrument({ instType = "SPOT", instId }) {
    return this.instruments({ instType, instId }).then((items) => items[0] || null);
  }

  async positions({ instId } = {}) {
    const positions = [
      {
        instType: "SPOT",
        instId: "BTC-USDT",
        pos: "1",
        avgPx: "50000",
        upl: "15000",
        mgnMode: "cash",
      },
    ];
    return positions.filter((item) => !instId || item.instId === instId);
  }

  async bills({ ccy, limit = 10 } = {}) {
    const count = Math.max(1, Math.min(Number(limit) || 10, 100));
    return Array.from({ length: count }, (_, index) => ({
      billId: `bill-${index + 1}`,
      ccy: ccy || "USDT",
      balChg: index === 0 ? "-65" : "0.5",
      fee: index === 0 ? "-0.01" : "0",
      type: "2",
      subType: "1",
      ts: String(Date.now() - index * 60_000),
    }));
  }

  async maxSize({ instId, tdMode = "cash" } = {}) {
    return {
      instId,
      tdMode,
      maxBuy: "1.5",
      maxSell: "1",
    };
  }

  async maxAvailSize({ instId, tdMode = "cash" } = {}) {
    return {
      instId,
      tdMode,
      availBuy: "1.4",
      availSell: "1",
    };
  }

  async feeRates({ instType = "SPOT", instId } = {}) {
    return {
      instType,
      instId,
      maker: "-0.0008",
      taker: "-0.001",
    };
  }

  async openOrders({ instId } = {}) {
    return this.orders.filter((order) => order.state === "live" && (!instId || order.instId === instId));
  }

  async orderHistory({ instId, state } = {}) {
    return this.orders.filter(
      (order) => (!instId || order.instId === instId) && (!state || order.state === state),
    );
  }

  async getOrder({ instId, ordId, clOrdId } = {}) {
    return (
      this.orders.find(
        (order) =>
          (!instId || order.instId === instId) &&
          ((ordId && order.ordId === ordId) || (clOrdId && order.clOrdId === clOrdId)),
      ) || null
    );
  }

  async openAlgoOrders({ instId, ordType, algoId, algoClOrdId } = {}) {
    return this.algoOrders.filter(
      (order) =>
        order.state === "live" &&
        (!instId || order.instId === instId) &&
        (!ordType || order.ordType === ordType) &&
        (!algoId || order.algoId === algoId) &&
        (!algoClOrdId || order.algoClOrdId === algoClOrdId),
    );
  }

  async algoOrderHistory({ instId, ordType, state, algoId, algoClOrdId } = {}) {
    return this.algoOrders.filter(
      (order) =>
        (!instId || order.instId === instId) &&
        (!ordType || order.ordType === ordType) &&
        (!state || order.state === state) &&
        (!algoId || order.algoId === algoId) &&
        (!algoClOrdId || order.algoClOrdId === algoClOrdId),
    );
  }

  async getAlgoOrder({ instId, algoId, algoClOrdId } = {}) {
    return (
      this.algoOrders.find(
        (order) =>
          (!instId || order.instId === instId) &&
          ((algoId && order.algoId === algoId) ||
            (algoClOrdId && order.algoClOrdId === algoClOrdId)),
      ) || null
    );
  }

  async fills({ instId, ordId } = {}) {
    return this.fillsLog.filter(
      (fill) => (!instId || fill.instId === instId) && (!ordId || fill.ordId === ordId),
    );
  }

  async fillsHistory(query = {}) {
    return this.fills(query);
  }

  async previewOrder(order) {
    const instrument = await this.instrument({ instId: order.instId });
    if (!instrument) throw new Error(`Mock instrument not found: ${order.instId}`);
    return {
      ok: true,
      simulated: true,
      instId: order.instId,
      side: order.side,
      ordType: order.ordType,
      sz: order.sz || order.amount,
      tdMode: order.tdMode || "cash",
      checks: [
        { code: "INSTRUMENT", ok: true, message: "instrument is tradable" },
        { code: "BALANCE", ok: true, message: "mock balance is sufficient" },
        { code: "SIZE", ok: true, message: `minSz=${instrument.minSz}` },
      ],
    };
  }

  async placeOrder(order) {
    const ordId = String(this.nextOrderId++);
    const now = String(Date.now());
    const created = {
      ordId,
      clOrdId: order.clOrdId || `mock-${ordId}`,
      instId: order.instId,
      side: order.side,
      ordType: order.ordType,
      sz: order.sz || order.amount,
      px: order.px,
      state: order.ordType === "market" ? "filled" : "live",
      source: "mock",
      ts: now,
    };
    this.orders.push(created);
    if (created.state === "filled") {
      this.fillsLog.push({
        instId: created.instId,
        ordId,
        tradeId: `fill-${ordId}`,
        side: created.side,
        fillSz: created.sz,
        fillPx: created.px || "65000.1",
        fee: "0.01",
        feeCcy: "USDT",
        ts: now,
      });
    }
    return created;
  }

  async amendOrder(order) {
    const existing = await this.getOrder(order);
    if (!existing) {
      throw new Error(`Mock order not found: ${order.ordId || order.clOrdId || "(missing id)"}`);
    }
    if (order.newSz || order.newSize) existing.sz = order.newSz || order.newSize;
    if (order.newPx || order.newPrice) existing.px = order.newPx || order.newPrice;
    existing.uTime = String(Date.now());
    return {
      ...existing,
      reqId: order.reqId,
      sCode: "0",
      sMsg: "",
    };
  }

  async cancelOrder({ instId, ordId, clOrdId }) {
    const order = this.orders.find(
      (item) =>
        item.instId === instId &&
        ((ordId && item.ordId === ordId) || (clOrdId && item.clOrdId === clOrdId)),
    );
    if (!order) {
      throw new Error(`Mock order not found: ${ordId || clOrdId || "(missing id)"}`);
    }
    order.state = "canceled";
    order.canceledAt = String(Date.now());
    return order;
  }

  async placeBatchOrders({ orders = [] } = {}) {
    return Promise.all(orders.map((order) => this.placeOrder(order)));
  }

  async amendBatchOrders({ orders = [] } = {}) {
    return Promise.all(orders.map((order) => this.amendOrder(order)));
  }

  async cancelBatchOrders({ orders = [] } = {}) {
    return Promise.all(orders.map((order) => this.cancelOrder(order)));
  }

  async cancelAllAfter({ timeOut } = {}) {
    this.cancelAllAfterTimeout = timeOut;
    return {
      triggerTime: timeOut === "0" || timeOut === 0 ? "" : String(Date.now() + Number(timeOut) * 1000),
      ts: String(Date.now()),
      timeOut: String(timeOut),
    };
  }

  async closePosition(position) {
    return {
      instId: position.instId,
      posSide: position.posSide || "",
      mgnMode: position.mgnMode,
      state: "closed",
      ts: String(Date.now()),
    };
  }

  async placeAlgoOrder(order) {
    const algoId = String(this.nextAlgoId++);
    const now = String(Date.now());
    const created = {
      ...order,
      algoId,
      algoClOrdId: order.algoClOrdId || `mock-algo-${algoId}`,
      ordType: order.ordType || "conditional",
      tdMode: order.tdMode || "cash",
      state: "live",
      source: "mock",
      cTime: now,
      uTime: now,
    };
    this.algoOrders.push(created);
    return created;
  }

  async amendAlgoOrder(order) {
    const algo = await this.getAlgoOrder(order);
    if (!algo) {
      throw new Error(`Mock algo order not found: ${order.algoId || order.algoClOrdId || "(missing id)"}`);
    }
    const updates = {
      sz: order.newSz || algo.sz,
      tpTriggerPx: order.newTpTriggerPx || algo.tpTriggerPx,
      tpOrdPx: order.newTpOrdPx || algo.tpOrdPx,
      tpTriggerPxType: order.newTpTriggerPxType || algo.tpTriggerPxType,
      slTriggerPx: order.newSlTriggerPx || algo.slTriggerPx,
      slOrdPx: order.newSlOrdPx || algo.slOrdPx,
      slTriggerPxType: order.newSlTriggerPxType || algo.slTriggerPxType,
      triggerPx: order.newTriggerPx || algo.triggerPx,
      orderPx: order.newOrderPx || algo.orderPx,
    };
    Object.assign(algo, updates, { uTime: String(Date.now()) });
    return {
      ...algo,
      reqId: order.reqId,
      sCode: "0",
      sMsg: "",
    };
  }

  async cancelAlgoOrder({ orders, ...order }) {
    const targets = Array.isArray(orders) ? orders : [order];
    return Promise.all(
      targets.map(async (target) => {
        const algo = await this.getAlgoOrder(target);
        if (!algo) {
          throw new Error(
            `Mock algo order not found: ${target.algoId || target.algoClOrdId || "(missing id)"}`,
          );
        }
        algo.state = "canceled";
        algo.canceledAt = String(Date.now());
        algo.uTime = algo.canceledAt;
        return {
          instId: algo.instId,
          algoId: algo.algoId,
          algoClOrdId: algo.algoClOrdId,
          state: algo.state,
        };
      }),
    );
  }

  createPrivateStream({ env, channels = [], onEvent }) {
    const startedAt = new Date().toISOString();
    let status = "active";
    let lastEventAt = null;
    const timer = setTimeout(() => {
      if (status !== "active") return;
      lastEventAt = new Date().toISOString();
      onEvent?.("okx.private.account", {
        arg: { channel: "account" },
        data: [
          {
            totalEq: "100000",
            ts: String(Date.now()),
          },
        ],
      });
    }, 50);
    return {
      close() {
        status = "closed";
        clearTimeout(timer);
      },
      status() {
        return {
          env,
          status,
          channels,
          startedAt,
          lastEventAt,
          lastError: null,
        };
      },
    };
  }
}
