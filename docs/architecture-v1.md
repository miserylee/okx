# OKX AI Trader Architecture v1

Last updated: 2026-07-03 02:16 +08:00.

## Goal

Build an OKX execution core that AI traders can use from their own workspace strategy scripts.
The daemon provides reliable exchange access, local state, streaming events, and audit logs. The AI
trader owns strategy logic, scheduling, loops, experiments, and handoff notes.

## Core Principles

- The daemon is not a strategy runtime.
- AI traders write and run their own strategy scripts.
- The daemon exposes execution primitives through local HTTP APIs and SSE streams.
- A Node SDK wraps daemon discovery and common calls for strategy scripts.
- AI trader strategy scripts should use the SDK, and direct one-off operations should use the CLI.
  Traders should not call OKX APIs, hand-roll daemon HTTP clients, or modify this package from a
  trader workspace. Missing capabilities should be reported to the human/package maintainer.
- Every operation is audited in sandbox and live.
- The daemon trusts the AI trader once credentials are configured; it does not enforce mandatory
  trade amount or frequency limits.
- The daemon supports a simple kill switch: `active` and `paused`.

## Terminology

- AI trader: the autonomous trading operator identity, stored as `name`.
- Workspace: the directory where one AI trader keeps scripts, docs, credentials, logs, and local
  trading materials.
- Daemon: the per-workspace background process serving one AI trader.
- Strategy script: code owned by the AI trader that calls the daemon.
- `env`: `sandbox` or `live`, selected when connecting through the SDK.
- `source`: script or strategy label, selected when connecting through the SDK and attached to all
  audit records for that client instance.

## Workspace Layout

`okx init --name <name>` creates or updates the workspace:

```text
workspace/
  okx.config.json
  credentials.env
  credentials.sandbox.env
  strategies/
  docs/
  logs/
  runtime/
```

The CLI must add these entries to `.gitignore`:

```gitignore
credentials.env
credentials.*.env
logs/
runtime/
*.log
```

`logs/` and `runtime/` are local workspace state and should not enter git.

## Config

Minimal `okx.config.json`:

```json
{
  "name": "btc-runner-01"
}
```

Do not add local config fields for trader preferences, temporary instrument tracking, or research
targets without explicit user approval. AI traders should keep those materials as notes under
`docs/` instead.

Optional credential overrides:

```json
{
  "name": "btc-runner-01",
  "credentials": {
    "live": "./credentials.env",
    "sandbox": "./credentials.sandbox.env"
  }
}
```

Default credential files:

- live: `credentials.env`
- sandbox: `credentials.sandbox.env`

Credential file format:

```env
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
```

## Runtime Registry

Dynamic daemon state lives outside the workspace:

```text
$HOME/.okx/registry/<name>.json
```

Registry schema:

```json
{
  "name": "btc-runner-01",
  "workspace": "/absolute/path/to/workspace",
  "pid": 12345,
  "port": 43127,
  "baseUrl": "http://127.0.0.1:43127",
  "state": "active",
  "version": "0.1.4",
  "startedAt": "2026-07-03T02:16:00+08:00",
  "lastHeartbeat": "2026-07-03T02:16:20+08:00"
}
```

The workspace stores stable identity and local materials. The registry stores runtime discovery
data such as pid, port, URL, state, and heartbeat.

## CLI

Initial command set:

```bash
okx context
okx init --name <ai-trader-name>
okx daemon start
okx daemon stop
okx daemon restart
okx daemon status
okx daemon doctor
okx daemon pause --reason "..."
okx daemon resume --reason "..."
okx state
okx instruments --inst-type SPOT --inst-id BTC-USDT --env sandbox --source cli-check
okx market ticker --inst-id BTC-USDT --env sandbox --source cli-check
okx market candles --inst-id BTC-USDT --bar 1m --limit 100
okx account balance --env sandbox --source cli-check
okx account positions --env sandbox --source cli-check
okx account available --ccy USDT --env sandbox --source cli-check
okx orders open --env sandbox --source cli-check
okx orders preview --inst-id BTC-USDT --side buy --type market --size 0.001
okx orders history --inst-id BTC-USDT --env sandbox --source cli-check
okx fills --inst-id BTC-USDT --env sandbox --source cli-check
okx audit recent --limit 20 --env sandbox --source cli-check
okx orders place --inst-id BTC-USDT --side buy --type market --size 0.001
okx orders cancel --inst-id BTC-USDT --ord-id <order-id>
```

No `endpoint` command is needed in v1. Strategy scripts should normally use the Node SDK for
discovery.

`okx context` prints the built-in AI trader operating manual. This replaces the need to install a
separate Codex skill for normal workspace operation. Agents should use the context command as their
first durable reference inside a trading workspace.

`okx init --name <ai-trader-name>` also creates or updates:

- `AGENTS.md`, with a short bootstrap instruction telling future agents to run
  `npm run okx -- context`
- `package.json`, with an `okx` npm script and an `okx-trader` dependency

CLI daemon operations default to `env=sandbox` and `source=cli`. Agents should pass clear
`--source` labels for auditable direct operations and must pass `--env live` explicitly for live
trading.

## Daemon API

The daemon binds to `127.0.0.1` on a dynamic port and records the port in the registry.

V1 HTTP surface:

```text
GET  /v1/health
GET  /v1/state
POST /v1/control/pause
POST /v1/control/resume

GET  /v1/instruments?instType=SPOT&instId=BTC-USDT
GET  /v1/instruments/BTC-USDT?instType=SPOT

GET  /v1/market/ticker?instId=BTC-USDT
GET  /v1/market/candles?instId=BTC-USDT&bar=1m&limit=100

GET  /v1/account/balance
GET  /v1/account/positions
GET  /v1/account/available?ccy=USDT

GET  /v1/orders/open
GET  /v1/orders/history
POST /v1/orders/preview
POST /v1/orders/place
POST /v1/orders/cancel
GET  /v1/fills

GET  /v1/audit/recent

GET  /v1/events
```

Raw HTTP callers must provide equivalent context fields for auditable operations:

- `env`: `sandbox` or `live`
- `source`: script or strategy label

The Node SDK should attach these automatically.

## SSE Events

`GET /v1/events` streams newline-delimited SSE events.

V1 event types:

- `daemon.status`
- `daemon.paused`
- `daemon.resumed`
- `market.ticker`
- `account.balance`
- `order.update`
- `risk.event`
- `error`

Each event should include:

```json
{
  "type": "order.update",
  "timestamp": "2026-07-03T02:16:00+08:00",
  "env": "sandbox",
  "source": "strategies/ma-cross-v1.js",
  "data": {}
}
```

## Node SDK

Strategy scripts connect with session-level context:

```js
import { connectOkxDaemon } from "okx-trader"

const okx = await connectOkxDaemon("btc-runner-01", {
  env: "sandbox",
  source: "strategies/ma-cross-v1.js"
})

const instruments = await okx.instruments.list({ instType: "SPOT", instId: "BTC-USDT" })
const ticker = await okx.market.ticker("BTC-USDT")
const positions = await okx.account.positions()
const available = await okx.account.available({ ccy: "USDT" })
const balance = await okx.account.balance()
const preview = await okx.orders.preview({
  instId: "BTC-USDT",
  side: "buy",
  ordType: "market",
  sz: "0.001"
})
await okx.orders.placeMarketBuy("BTC-USDT", "0.001")
```

If one script needs sandbox and live, it creates two clients:

```js
const sandbox = await connectOkxDaemon("btc-runner-01", {
  env: "sandbox",
  source: "ma-cross-v1"
})

const live = await connectOkxDaemon("btc-runner-01", {
  env: "live",
  source: "ma-cross-v1"
})
```

All operations from one client inherit `env` and `source`.

## Kill Switch

V1 daemon states:

- `active`: read and write operations are allowed.
- `paused`: read operations are allowed; trading write operations are rejected and audited.

Pause/resume can be triggered by:

- human through CLI
- AI trader through CLI
- strategy script through SDK
- daemon itself when execution integrity is unsafe

Daemon self-pause should be limited to system integrity failures, such as:

- repeated OKX authentication failure
- clock drift that would break request signing
- credential file read failure
- audit log write failure
- inconsistent daemon internal state
- sustained exchange connectivity failure across REST and WebSocket

The daemon should not self-pause only because a strategy is losing money or trading large size.
Those decisions belong to the AI trader strategy.

## Audit Logs

All operations are audited, including sandbox reads. Logs should be optimized for future AI trader
review and scene reconstruction.

Default log location:

```text
logs/audit.jsonl
```

Suggested JSONL record:

```json
{
  "id": "01HZ...",
  "timestamp": "2026-07-03T02:16:00+08:00",
  "name": "btc-runner-01",
  "env": "sandbox",
  "source": "strategies/ma-cross-v1.js",
  "kind": "order.place",
  "method": "POST",
  "path": "/v1/orders/place",
  "request": {
    "instId": "BTC-USDT",
    "side": "buy",
    "ordType": "market",
    "amount": "0.001"
  },
  "result": {
    "ok": true,
    "orderId": "123",
    "status": "accepted"
  },
  "error": null,
  "latencyMs": 128
}
```

Sensitive fields such as API keys, secret keys, passphrases, and raw auth headers must never be
written to audit logs.

## Skill Scope

The OKX skill should provide:

- setup guidance for AI traders
- daemon and CLI usage instructions
- Node SDK usage examples
- strategy scripting best practices
- audit review and handoff templates
- sandbox-to-live operational guidance

For v1 packaging, these materials should primarily live in the `okx context` CLI output so agents
can bootstrap from a normal npm dependency without installing a separate skill. The package should
publish the CLI and SDK together under one npm package, `okx-trader`.

The package should not provide a strategy runtime. AI traders run their own scripts in their own
workspace.
