export class MockExchange {
  constructor() {
    this.nextOrderId = 1;
    this.orders = [];
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

  async openOrders() {
    return this.orders.filter((order) => order.state === "live");
  }

  async orderHistory({ instId, state } = {}) {
    return this.orders.filter(
      (order) => (!instId || order.instId === instId) && (!state || order.state === state),
    );
  }

  async fills({ instId, ordId } = {}) {
    return this.fillsLog.filter(
      (fill) => (!instId || fill.instId === instId) && (!ordId || fill.ordId === ordId),
    );
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
}
