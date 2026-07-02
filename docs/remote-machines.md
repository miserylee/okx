# Remote Machines

## Tencent Cloud OKX Sandbox Host

Last verified: 2026-07-03 Asia/Shanghai.

### Access

- Host: `106.52.174.109`
- SSH user: `ubuntu`
- Local SSH identity: `$HOME/.ssh/id_ed25519`
- Local public key fingerprint: `SHA256:5lXFjSjW95xGsjAA5pqWcAT1DzOV2UjeLy7rfCEfRNA yunxiao`

Connect from this workstation:

```powershell
ssh -i $HOME/.ssh/id_ed25519 ubuntu@106.52.174.109
```

### System

- Provider: Tencent Cloud CVM
- Hostname: `VM-0-16-ubuntu`
- OS: Ubuntu 24.04 LTS
- Kernel: `6.8.0-71-generic`
- Architecture: x86-64
- Virtualization: KVM
- Memory observed: 3.6 GiB total, about 2.6 GiB available after boot
- Disk observed: `/dev/vda2`, 59 GiB total, 13 GiB used, 44 GiB available
- Docker: not installed
- Node.js: `v22.22.1`
- npm: `10.9.4`
- Python: `3.12.3`
- Git: `2.43.0`
- PM2: `6.0.14`

### Important Paths

- Current OKX project: `/home/ubuntu/projects/okx-integration`
- Older OKX project copy: `/home/ubuntu/okx-integration`
- OKX/news proxy service: `/home/ubuntu/okx-proxy`
- Clash config/runtime: `/home/ubuntu/.clash`
- OpenClaw runtime: `/home/ubuntu/.openclaw`
- PM2 data/logs: `/home/ubuntu/.pm2`

Do not copy remote `.env`, private keys, tokens, or logs into the repository. Sandbox OKX
credentials copied from this host are stored locally outside the repository at
`$HOME/.okx/okx-api-credentials.sandbox.env`.

### Running Services Observed

- `ssh.service`: SSH access on port `22`
- `clash.service`: Clash client, local proxy on `127.0.0.1:7890`
- `okx-proxy.service`: Node service from `/home/ubuntu/okx-proxy/server.js`, listens on `3001`
- `pm2-ubuntu.service`: PM2 process manager
- `openclaw-gateway`: local OpenClaw gateway ports `28789`, `28791`, and `28792`
- Tencent Cloud agents: `tat_agent`, `barad_agent`, `YDService`, `YDLive`

Server-side listeners observed with `ss` included `22`, `3001`, `9800`, and `9090`. Cloud firewall
rules may still restrict public access; the user noted the firewall is not intentionally opened for
the Clash control port.

### PM2 Processes

Observed with `pm2 list`:

- `okx-api`: online
  - CWD: `/home/ubuntu/projects/okx-integration`
  - Entry: `/home/ubuntu/projects/okx-integration/api-server.js`
  - Port: `9800`
- `okx-auto-trade`: stopped
- `okx-news-crawl`: stopped
- `okx-report`: stopped

### Remote OKX Project Notes

The current remote OKX project is a historical prototype. It is useful as reference material, but
do not treat it as production-ready trading code.

Useful ideas observed:

- OKX REST and WebSocket integration through `ccxt` and `ws`
- Agent-facing API server with routes for market data, account data, decisions, and trade execution
- SQLite news/decision database at `data/okx-news.db`
- Risk modules for position sizing, fixed stop loss, trailing stop, daily loss, and consecutive loss
- RSS/news pipeline, market-analysis prompts, and OpenClaw plugin/cron packaging

Known caveats:

- `npm run build` passed in `/home/ubuntu/projects/okx-integration`.
- `npm test` failed there because tests still reference old `src/...` paths after the project was
  reorganized under `core/...`.
- The API server has a `/api/trade` endpoint that can call OKX order creation. Any future
  reimplementation should gate real trading behind an explicit enable flag and risk checks.
- Some docs describe more news sources and AI flow than the current code fully implements.
- Some remote files contain hardcoded third-party API keys; do not copy those into this repository.
