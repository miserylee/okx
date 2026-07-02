import { MockExchange } from "./mock.mjs";
import { OkxRestExchange } from "./okx-rest.mjs";

export function createExchange({ workspace, config }) {
  const provider = process.env.OKX_DAEMON_EXCHANGE || config.exchange || "okx";
  if (provider === "mock") return new MockExchange();
  if (provider === "okx") return new OkxRestExchange({ workspace, config });
  throw new Error(`Unsupported exchange provider: ${provider}`);
}
