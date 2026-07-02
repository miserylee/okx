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

GitHub Actions workflow: `.github/workflows/publish-npm.yml`.

This project uses npm Trusted Publishing through GitHub Actions OIDC, so no long-lived npm token is
stored in GitHub secrets.

npm setup:

1. On npmjs.com, configure `okx-trader` with a GitHub Actions trusted publisher.
2. Use GitHub owner/repo: `miserylee/okx`.
3. Use workflow filename: `publish-npm.yml`.
4. Allow `npm publish`.

Release flow:

```powershell
npm version patch
git push origin main --tags
```

Pushing a `v*` tag publishes automatically. You can also open GitHub Actions, run
`Publish npm package`, and set `publish` to `true`. The workflow runs `npm ci`,
`npm run check:mjs`, `npm run mock:story`, and `npm pack --dry-run` before publishing
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

const ticker = await okx.market.ticker("BTC-USDT")
const balance = await okx.account.balance()
```

Runtime registry files live under `$OKX_HOME/registry` or `$HOME/.okx/registry` by default.
Workspace credentials, logs, and runtime files are ignored by git.

Agents can load the built-in operating manual at any time:

```powershell
npm run okx -- context
```

## Mock Story

Run the local end-to-end story:

```powershell
npm run mock:story
```

The story creates `mock/.tmp/workspace`, starts a daemon with the mock exchange adapter, verifies
HTTP, SSE, SDK calls, pause/resume behavior, order rejection while paused, and JSONL audit records.
