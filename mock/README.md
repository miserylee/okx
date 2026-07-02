# Mock Story

This directory contains an end-to-end local story for the v1 daemon, CLI, SDK, SSE, and audit log
flow.

Run it from the repository root:

```bash
npm run mock:story
```

The story creates a temporary AI trader workspace under `mock/.tmp/workspace` and sets `OKX_HOME`
to `mock/.tmp/home`, so it does not touch real local daemon registry files or credentials.
