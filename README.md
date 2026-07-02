# OKX Automation

Local automation workspace for OKX API experiments.

## Documentation

- [Remote machines](./docs/remote-machines.md)

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
