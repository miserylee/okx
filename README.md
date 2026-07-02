# OKX Automation

Local automation workspace for OKX API experiments.

## Package

Package name: `okx-trader`.

The package includes both:

- CLI bins: `okx` and `okx-trader`
- Node SDK export: `connectOkxDaemon`

Recommended first-run flow for a new AI trader workspace:

```powershell
npm init -y
npm install okx-trader
npm pkg set scripts.okx=okx
npm run okx -- init --name btc-runner-01
npm run okx -- context
```

After `init`, the workspace `AGENTS.md` tells future agents to call the built-in context command.

## Publishing

GitHub Actions workflow: `.github/workflows/publish.yml`.

This project uses npm Trusted Publishing through GitHub Actions OIDC, so no long-lived npm token is
stored in GitHub secrets.

npm setup:

1. On npmjs.com, configure `okx-trader` with a GitHub Actions trusted publisher.
2. Use GitHub owner/repo: `miserylee/okx`.
3. Use workflow filename: `publish.yml`.
4. Allow `npm publish`.

Release flow:

```powershell
npm version patch
git push origin main --tags
```

Pushing `main` or a `v*` tag runs validation only. Do not publish a new npm version unless the user
explicitly asks for a release. To publish, open GitHub Actions, run `Publish npm package`, and set
`publish` to `true`. The workflow checks whether the package version already exists, then runs
`npm ci`, `npm run check:mjs`, `npm run mock:story`, and `npm pack --dry-run` before publishing
`okx-trader` to npm through trusted publishing.

## Documentation

- [Remote machines](./docs/remote-machines.md)
- [Architecture v1](./docs/architecture-v1.md)

## Credentials

Secrets live outside this repository:

- Credentials env file: `$HOME/.okx/okx-api-credentials.env`
- Sandbox trading credentials env file: `$HOME/.okx/okx-api-credentials.sandbox.env`

Expected credentials format:

```env
OKX_API_KEY=your-api-key
OKX_SECRET_KEY=your-secret-key
OKX_PASSPHRASE=your-passphrase
```

Do not put real secrets in repository files.

## Smoke Test

Run the REST and WebSocket smoke test:

```powershell
npm run smoke:okx
```

Useful options:

```powershell
npm run smoke:okx -- --public-only
npm run smoke:okx -- --simulated
npm run smoke:okx -- --env=$HOME/.okx/okx-api-credentials.sandbox.env --simulated
npm run smoke:okx -- --inst-id=ETH-USDT
npm run smoke:okx -- --proxy=http://127.0.0.1:7890
npm run smoke:okx -- --no-proxy
```

On Windows, the smoke test auto-detects the current user's system proxy when `HTTP_PROXY`,
`HTTPS_PROXY`, and `OKX_PROXY` are not set. `OKX_PROXY` or `--proxy=...` takes precedence.

The smoke test only reads public market data and private account connectivity. It does not place,
cancel, or amend orders.

## V1 Daemon

Initialize an AI trader workspace:

```powershell
npm run okx -- init --name btc-runner-01
```

Start and manage the per-workspace daemon:

```powershell
npm run okx -- daemon start
npm run okx -- daemon status
npm run okx -- daemon pause --reason "manual pause"
npm run okx -- daemon resume --reason "manual resume"
npm run okx -- daemon stop
```

Strategy scripts can connect through the Node SDK:

```js
import { connectOkxDaemon } from "okx-trader"

const okx = await connectOkxDaemon("btc-runner-01", {
  env: "sandbox",
  source: "strategies/example.mjs"
})

const instruments = await okx.instruments.list({ instType: "SPOT", instId: "BTC-USDT" })
const ticker = await okx.market.ticker("BTC-USDT")
const balance = await okx.account.balance()
```

Runtime registry files live under `$OKX_HOME/registry` or `$HOME/.okx/registry` by default.
Workspace credentials, logs, and runtime files are ignored by git.

Agents can load the built-in operating manual at any time:

```powershell
npm run okx -- context
```

Agents can also query and trade through the CLI without writing a strategy script first:

```powershell
npm run okx -- state
npm run okx -- instruments --inst-type SPOT --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- market ticker --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- market books --inst-id BTC-USDT --size 5 --env sandbox --source cli-check
npm run okx -- market trades --inst-id BTC-USDT --limit 20 --env sandbox --source cli-check
npm run okx -- market funding-rate --inst-id BTC-USDT-SWAP --env sandbox --source cli-check
npm run okx -- market open-interest --inst-id BTC-USDT-SWAP --env sandbox --source cli-check
npm run okx -- account positions --env sandbox --source cli-check
npm run okx -- account available --ccy USDT --env sandbox --source cli-check
npm run okx -- account balance --env sandbox --source cli-check
npm run okx -- account bills --limit 20 --env sandbox --source cli-check
npm run okx -- account max-size --inst-id BTC-USDT --td-mode cash --env sandbox --source cli-check
npm run okx -- account fee-rates --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- orders open --env sandbox --source cli-check
npm run okx -- orders get --inst-id BTC-USDT --ord-id <order-id> --env sandbox --source cli-check
npm run okx -- orders preview --inst-id BTC-USDT --side buy --type market --size 0.001 --env sandbox --source cli-test
npm run okx -- orders history --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- orders algo-open --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- orders algo-history --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- fills --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- fills history --inst-id BTC-USDT --env sandbox --source cli-check
npm run okx -- audit recent --limit 20 --env sandbox --source cli-check
npm run okx -- orders place --inst-id BTC-USDT --side buy --type market --size 0.001 --env sandbox --source cli-test
npm run okx -- orders amend --inst-id BTC-USDT --ord-id <order-id> --new-price 101 --env sandbox --source cli-test
npm run okx -- orders cancel --inst-id BTC-USDT --ord-id <order-id> --env sandbox --source cli-test
npm run okx -- orders batch-place --orders-json '[{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.001","px":"100"}]' --env sandbox --source cli-test
npm run okx -- orders cancel-all-after --timeout 30 --env sandbox --source cli-test
npm run okx -- orders tp-sl --inst-id BTC-USDT --side sell --size 0.001 --tp-trigger-px 70000 --sl-trigger-px 62000 --env sandbox --source cli-protect
npm run okx -- orders algo-cancel --inst-id BTC-USDT --algo-id <algo-id> --env sandbox --source cli-protect
npm run okx -- streams private-start --channels account,positions,orders,orders-algo --env sandbox --source cli-stream
```

CLI daemon requests default to `--env sandbox --source cli`. Pass `--env live` explicitly for live
trading.

## Mock Story

Run the local end-to-end story:

```powershell
npm run mock:story
```

The story creates `mock/.tmp/workspace`, starts a daemon with the mock exchange adapter, verifies
HTTP, SSE, SDK calls, CLI daemon calls, pause/resume behavior, order rejection while paused, and
JSONL audit records.
