export class MockExchange {
  constructor() {
    this.nextOrderId = 1;
    this.orders = [];
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

  async openOrders() {
    return this.orders.filter((order) => order.state === "live");
  }

  async placeOrder(order) {
    const ordId = String(this.nextOrderId++);
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
      ts: String(Date.now()),
    };
    this.orders.push(created);
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
