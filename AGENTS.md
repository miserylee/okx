# AGENTS.md instructions

This repository uses harnessize for thin, progressive agent guidance.

## Start Here

1. Run `npx -y harnessize@latest context` as required session bootstrap before repository work.
2. Follow the root context to choose any focused topic supported by the installed harnessize version.
3. Inspect the relevant code and docs before making durable changes.
4. Keep repository changes minimal and preserve user work.
5. Run relevant verification before reporting implementation work as complete.

If conversation context has been compacted or your short-term memory no longer contains the
harnessize root context, run `npx -y harnessize@latest context` again before continuing repository
work.

## Multi-Agent Adapters

Keep durable harness guidance in this file. Adapter files such as `CLAUDE.md` or
`.cursor/rules/harnessize.mdc` should only point agents back here so the repository has one source
of truth.

## Local Secrets

- OKX API key, secret key, and passphrase should be stored outside this repository at
  `$HOME/.okx/okx-api-credentials.env`.
- OKX sandbox trading API key, secret key, and passphrase should be stored outside this repository at
  `$HOME/.okx/okx-api-credentials.sandbox.env`.
- Do not commit the passphrase or copy its contents into repository files. Local scripts should
  read secrets from the paths above when needed.
