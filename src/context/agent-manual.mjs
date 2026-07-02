export const PACKAGE_NAME = "okx-trader";
export const CLI_SCRIPT_NAME = "okx";

export function renderAgentContext() {
  return `# OKX AI Trader Context

You are operating an OKX AI trader workspace. Use this package as the execution core:

- CLI package: \`${PACKAGE_NAME}\`
- Local command: \`npm run ${CLI_SCRIPT_NAME} -- <command>\`
- SDK import: \`import { connectOkxDaemon } from "${PACKAGE_NAME}"\`

## First Commands

Always start by reading this context:

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- context
\`\`\`

Check the workspace and daemon:

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- daemon doctor
npm run ${CLI_SCRIPT_NAME} -- daemon status
\`\`\`

Start the daemon when needed:

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- daemon start
\`\`\`

## Credentials

Default credential files live in the workspace root and must stay out of git:

- \`credentials.env\` for live trading
- \`credentials.sandbox.env\` for sandbox trading

Expected format:

\`\`\`env
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
\`\`\`

Do not write API keys, secret keys, passphrases, auth headers, or signatures into docs, logs,
strategy notes, prompts, or audit summaries.

## Strategy Scripts

Strategy scripts own scheduling, loops, experiments, and trading decisions. The daemon is not a
strategy runtime. Connect once per environment/source pair:

\`\`\`js
import { connectOkxDaemon } from "${PACKAGE_NAME}"

const okx = await connectOkxDaemon("my-ai-trader", {
  env: "sandbox",
  source: "strategies/example.mjs"
})

const ticker = await okx.market.ticker("BTC-USDT")
const balance = await okx.account.balance()
await okx.orders.placeMarketBuy("BTC-USDT", "0.001")
\`\`\`

Use two SDK clients if a strategy intentionally touches both sandbox and live:

\`\`\`js
const sandbox = await connectOkxDaemon("my-ai-trader", {
  env: "sandbox",
  source: "strategies/example.mjs"
})

const live = await connectOkxDaemon("my-ai-trader", {
  env: "live",
  source: "strategies/example.mjs"
})
\`\`\`

## Daemon Controls

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- daemon start
npm run ${CLI_SCRIPT_NAME} -- daemon stop
npm run ${CLI_SCRIPT_NAME} -- daemon restart
npm run ${CLI_SCRIPT_NAME} -- daemon status
npm run ${CLI_SCRIPT_NAME} -- daemon doctor
npm run ${CLI_SCRIPT_NAME} -- daemon pause --reason "manual pause"
npm run ${CLI_SCRIPT_NAME} -- daemon resume --reason "manual resume"
\`\`\`

State model:

- \`active\`: reads and trading writes are allowed.
- \`paused\`: reads are allowed; trading writes are rejected and audited.

The daemon does not enforce trade amount or frequency limits. Put strategy-specific limits in the
strategy script when desired.

## CLI Data And Trading

Agents can call the daemon directly through the CLI. CLI daemon requests default to
\`--env sandbox --source cli\`. Use \`--env live\` explicitly for live trading.

\`\`\`bash
npm run okx -- state
npm run okx -- market ticker --inst-id BTC-USDT --env sandbox --source manual-check
npm run okx -- market candles --inst-id BTC-USDT --bar 1m --limit 100
npm run okx -- account balance --env sandbox --source balance-check
npm run okx -- orders open --env sandbox --source order-review
npm run okx -- orders place --inst-id BTC-USDT --side buy --type market --size 0.001 --env sandbox --source cli-test
npm run okx -- orders cancel --inst-id BTC-USDT --ord-id <order-id> --env sandbox --source cli-test
\`\`\`

Prefer clear \`--source\` labels so audit logs explain why the CLI call happened.

## Audit And Handoff

Every daemon operation is audited to \`logs/audit.jsonl\`, including sandbox reads. Use audit logs
to reconstruct what happened before changing a strategy.

When handing off to another agent/session, leave notes in workspace docs that include:

- strategy file/source name
- daemon state and environment used
- important audit record ids or time window
- reason for strategy changes
- next intended observation or action

## Runtime Discovery

Daemon runtime registry is outside the workspace:

\`\`\`text
$OKX_HOME/registry/<name>.json
$HOME/.okx/registry/<name>.json
\`\`\`

Do not store dynamic pid, port, or base URL in workspace docs. Use the CLI or SDK registry
discovery instead.
`;
}

export function renderAgentBootstrapGuide() {
  return `## OKX AI Trader

This workspace is managed with the \`${PACKAGE_NAME}\` CLI and SDK.

Start every trading session by loading the built-in context:

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- context
\`\`\`

Then inspect the daemon:

\`\`\`bash
npm run ${CLI_SCRIPT_NAME} -- daemon doctor
npm run ${CLI_SCRIPT_NAME} -- daemon status
\`\`\`

If the local package is not installed yet, run:

\`\`\`bash
npm install
\`\`\`

Keep credentials in \`credentials.env\` and \`credentials.sandbox.env\`. Never commit or quote real
OKX secrets.
`;
}
