# OKX Strategy Architecture Brainstorm

## Turn 1 - Agent Role Boundary - 2026-07-03 01:07 +08:00

- User signal: The new OKX project should not let an agent directly buy or sell. The agent has
  latency and cognitive bias, which can make trading unstable. The preferred model is for the
  agent to guide strategy, while deterministic scripts execute automated trading. The agent should
  periodically review results and decide whether strategy adjustments are needed.
- Agent work: Agreed that the agent should sit outside the order execution loop as researcher,
  reviewer, and strategy maintainer. Initial architecture direction: deterministic trading engine
  owns execution; agent owns analysis, strategy proposals, parameter review, and operational
  audits.
- Sources: conversation; no external sources.
- Decisions: Agent must not directly execute orders in the live trading path.
- Open questions: exact review cadence, strategy update approval flow, sandbox-to-live promotion
  gates, and whether agent-authored strategy changes require human approval before activation.

## Turn 2 - Strategy Scripts and Skill Boundary - 2026-07-03 01:07 +08:00

- User signal: Strategy configuration is not flexible enough. The preferred model is for agents to
  author strategy scripts that call the execution layer directly. Good strategy scripts can later be
  promoted down into the execution layer as reusable primitives. Humans should not become the
  bottleneck; agents can keep working while humans rest. Humans should inspect reports and trade
  records and can intervene when needed. Agents must record decisions in docs for handoff across
  sessions. At runtime, the OKX project should be exposed as a skill for other sessions to call,
  rather than doing all operational work inside this repository thread.
- Agent work: Revised architecture direction from config-driven strategies to agent-authored
  script strategies over a stable execution SDK. Identified durable handoff docs and a thin OKX
  operational skill as first-class architecture pieces.
- Sources: conversation; no external sources.
- Decisions: Strategy layer should be script-based and agent-authored; execution layer should
  expose stable trading primitives; handoff documentation is required for each material strategy
  decision or operational change; future runtime access should be through an OKX skill usable by
  other sessions.
- Open questions: where strategy scripts live, what gates allow scripts to run live, what minimum
  decision record schema is required, and whether the OKX skill is installed from this repo or kept
  as a separate local skill that references this repo.

## Turn 3 - AI Trader Workspace and Skill Scope - 2026-07-03 01:27 +08:00

- User signal: Each AI trader will have its own project workspace and can freely manage its
  own materials there. The OKX skill should provide the core execution layer and guidance manual.
  AI traders should manage and run their own strategy scripts in their own workspace. The OKX
  skill does not provide a runtime, but it can provide best-practice guidance.
- Agent work: Refined the architecture boundary: the OKX skill is a capability/manual package, not
  a strategy host. Strategy scripts, AI trader notes, experiments, and runtime records belong to the
  AI trader workspace unless and until a reusable piece is intentionally promoted into the OKX
  execution core.
- Sources: conversation; no external sources.
- Decisions: OKX skill scope is core execution layer plus guidance and best practices; no bundled
  strategy runtime; no assumption that strategy scripts live in this repository.
- Open questions: what API surface the execution core exposes to AI trader workspaces, how AI trader
  scripts authenticate to sandbox/live environments, and which best-practice templates the skill
  should ship.

## Turn 4 - Daemon Service and Workspace Isolation - 2026-07-03 01:36 +08:00

- User signal: The execution core should run as a daemon service. AI traders connect to the
  daemon from their own strategy scripts. The daemon should expose HTTP APIs and SSE streams. The
  project should also provide a CLI for workspace initialization, guiding users through required API
  key preparation, and for daemon lifecycle management such as start, stop, and restart. Multiple
  AI traders may run on the same machine, so each workspace daemon must have isolated
  environment, configuration, and process state. Startup details should be written into workspace
  project documentation.
- Agent work: Updated architecture shape from a generic skill/SDK to a per-workspace daemon plus
  CLI model. Identified isolation boundaries: workspace config, credentials references, daemon
  process, local port/socket, pid/log files, and generated AI trader docs.
- Sources: conversation; no external sources.
- Decisions: OKX execution core should be delivered as a daemon service with HTTP and SSE; a CLI
  should manage initialization and daemon lifecycle; daemon instances are per-workspace and must be
  isolated so multiple AI traders can coexist on one machine; startup/runtime details should be
  recorded into each AI trader workspace's docs.
- Open questions: exact daemon transport binding strategy (localhost TCP port vs Unix/Windows named
  pipe plus HTTP), port allocation and discovery, auth model between strategy scripts and daemon,
  and the initial CLI command set.

## Turn 5 - Stable Daemon Name and Runtime Registry - 2026-07-03 01:39 +08:00

- User signal: Use a unique name as the daemon startup identifier. Dynamic runtime details such as
  port and pid should not be written into the workspace because they are not stable project
  information.
- Agent work: Refined discovery model: workspace docs/config should contain a stable daemon name
  and intended environment, while pid, port, base URL, heartbeat timestamp, and process status
  should live in an external runtime registry maintained by the CLI/daemon.
- Sources: conversation; no external sources.
- Decisions: Use a stable unique daemon name as the workspace-facing identifier. Do not persist
  dynamic port/pid runtime details into workspace docs.
- Open questions: exact registry location, daemon-name naming rules, collision handling, and the
  CLI command used by strategy scripts to resolve a daemon name into an endpoint.

## Turn 6 - Environment Selection and Identity Fields - 2026-07-03 01:43 +08:00

- User signal: Each AI trader can have both sandbox and live OKX API keys at the same time, so mode
  should not be fixed at daemon level. `daemonName` and `project` are redundant identity fields.
- Agent work: Refined daemon identity model: one daemon represents an AI trader/workspace and
  may expose both sandbox and live capabilities if configured. Environment selection belongs to
  each request, script, or explicit operation, not to the daemon process identity. Project config
  should use one stable unique AI trader `name` field rather than separate daemon/project names.
- Sources: conversation; no external sources.
- Decisions: Remove fixed daemon mode from stable identity; allow one daemon to manage both sandbox
  and live credentials; collapse `daemonName` and `project` into a single unique AI trader name.
- Open questions: request-level environment selector shape, live-operation safeguards, and how CLI
  init should name and validate the daemon/workspace identity.

## Turn 7 - Workspace Credentials Defaults - 2026-07-03 01:44 +08:00

- User signal: Credentials can live directly in the AI trader workspace for simplicity. The system
  can use default credential paths without requiring explicit config, while still supporting custom
  credential path overrides.
- Agent work: Refined credential layout: per-workspace credential files improve isolation between
  multiple AI traders on the same machine. CLI init should create default local credential files
  under the workspace, ensure they are ignored by git, set restrictive file permissions where
  possible, and optionally let advanced users override paths in config.
- Sources: conversation; no external sources.
- Decisions: Default credential location should be workspace-local, with config override support.
- Open questions: exact default filenames, whether live credentials are created during init or only
  on demand, and how CLI validates that workspace-local secrets are ignored before daemon start.

## Turn 8 - Root Workspace Credentials and Git Ignore - 2026-07-03 01:46 +08:00

- User signal: Credentials must not enter git, so project init should write ignore rules
  automatically. Since the workspace itself is already dedicated to trading, there is no need for an
  extra `.okx` directory layer.
- Agent work: Refined default workspace layout: credential files should live directly at the
  workspace root using clear names, and CLI init should append the required local-secret and runtime
  patterns to `.gitignore`.
- Sources: conversation; no external sources.
- Decisions: Do not create an extra `.okx/` layer by default. Default credential files live at the
  workspace root and are ignored by git during init.
- Open questions: final root filenames for live/sandbox credentials, runtime registry filename or
  directory, and whether daemon state also belongs at workspace root or remains user-runtime only.

## Turn 9 - Init Requires User-Provided AI Trader Name - 2026-07-03 01:47 +08:00

- User signal: During init, the user must first provide a name. The OKX skill manual should guide
  the agent to obtain this name from the user.
- Agent work: Refined init flow: `okx init` should not silently invent the stable identity. The
  skill should instruct AI traders to ask for a concise unique AI trader name before initializing.
  That name becomes the stable identity used by config, daemon lookup, reports, logs, and handoff
  docs.
- Sources: conversation; no external sources.
- Decisions: Init requires a user-provided stable AI trader `name`; the skill manual must include
  this pre-init question.
- Open questions: name validation rules and whether CLI also accepts `--name` for non-interactive
  initialization.

## Turn 10 - Workspace Directory vs AI Trader Name - 2026-07-03 01:48 +08:00

- User signal: Workspace means the directory/project space. The `name` field should mean the AI
  trader name.
- Agent work: Clarified terminology: workspace is a filesystem/project container; AI trader name is
  the stable identity used by daemon discovery, logs, reports, and handoff records.
- Sources: conversation; no external sources.
- Decisions: Use "AI trader name" for the `name` field; do not call it workspace name.
- Open questions: none for this terminology point.

## Turn 11 - Confirmation Checklist - 2026-07-03 01:51 +08:00

- User signal: Asked what still needs confirmation.
- Agent work: Collapsed the accumulated open questions into implementation-blocking decision
  areas: AI trader name validation, default credential filenames, runtime registry location,
  daemon HTTP/SSE auth, live-operation safeguards, and initial CLI command set.
- Sources: `docs/strategy-architecture-brainstorm.md`.
- Decisions: none.
- Open questions: see the confirmation checklist in the current conversation.

## Turn 12 - Initial Confirmations and Strategy ID Question - 2026-07-03 01:56 +08:00

- User signal: Confirmed AI trader name rules are fine; default credential filenames can be brief;
  runtime registry under `$HOME/.okx/registry/<name>.json` is acceptable; provide a Node SDK in
  addition to CLI endpoint discovery, including convenience methods for core daemon operations; no
  local HTTP/SSE token is needed. Asked what `strategyId` means.
- Agent work: Interpreted "brief credential filenames" as keeping `credentials.env` for live and
  `credentials.sandbox.env` for sandbox unless later corrected. Clarified that `strategyId` is an
  audit label tying live actions to a specific strategy script/version, not an execution mechanism.
- Sources: conversation; no external sources.
- Decisions: AI trader names use simple validated kebab-case; registry location can be
  `$HOME/.okx/registry/<name>.json`; ship both CLI and Node SDK; do not require a local daemon
  auth token for the first version.
- Open questions: whether live operations should require a strategy/script audit label, and what
  exact name to use for that field if required.

## Turn 13 - SDK Session Context for Env and Source - 2026-07-03 02:00 +08:00

- User signal: Put `env` and `source` into the `connectOkxDaemon` parameters. Once a script has an
  OKX client instance, later operations should not need to repeat those fields. Both sandbox and
  live clients should carry `source`. If one script wants to use both sandbox and live, it should
  create two instances. Different strategies can create multiple instances. The AI trader controls
  how scripts run and loop.
- Agent work: Refined SDK design: environment and source are session/client context, not per-call
  boilerplate. The daemon should receive these context fields with each SDK request for audit, but
  strategy scripts only declare them when constructing the client.
- Sources: conversation; no external sources.
- Decisions: Node SDK connection requires or accepts `{ env, source }`; all operations on that
  client inherit those values; both sandbox and live clients include `source`; scripts may create
  multiple clients for multiple environments or strategy sources; loop/scheduling model belongs to
  AI trader strategy scripts, not to the OKX skill runtime.
- Open questions: exact SDK constructor shape and whether raw HTTP callers must provide equivalent
  headers or request fields.

## Turn 14 - Remaining Design Confirmations - 2026-07-03 02:03 +08:00

- User signal: Confirmed the SDK session-context model and asked what else needs to be decided.
- Agent work: Identified remaining first-version design decisions: daemon API surface, SSE event
  channels, live safeguards, file layout, runtime registry schema, audit log format, and CLI command
  scope.
- Sources: conversation; no external sources.
- Decisions: none.
- Open questions: see the remaining confirmation list in the current conversation.

## Turn 15 - Audit, Trust Model, CLI Scope, and Kill Switch - 2026-07-03 02:08 +08:00

- User signal: All operations need audit logs, including sandbox, because clear logs help agents
  adjust strategies later. The system should trust AI traders once API keys are provided. Do not
  enforce trade limits in the daemon; AI trader scripts may implement their own limits if desired.
  Asked how kill switch should work. Confirmed workspace `logs/` and `runtime/` layout is OK.
  Delegated registry schema decisions to the agent. CLI does not need an endpoint command. Logs
  should be designed for agent-readable reconstruction of context.
- Agent work: Reframed live safeguards away from mandatory position/order limits and toward full
  auditability plus explicit kill switch controls. The daemon should not second-guess a trusted AI
  trader's sizing decisions by default.
- Sources: conversation; no external sources.
- Decisions: Full audit logging for sandbox and live; no mandatory daemon-level trade amount/count
  limits; workspace root `logs/` and `runtime/` are acceptable and ignored; no `okx daemon endpoint`
  command in the initial CLI; audit logs should prioritize reconstructing context for future agent
  review.
- Open questions: exact kill switch semantics and recovery flow.

## Turn 16 - Kill Switch Accepted and CLI as AI Trader Control Surface - 2026-07-03 02:10 +08:00

- User signal: Accepted the kill switch model. Also clarified that AI traders can trigger controls
  directly through CLI commands.
- Agent work: Finalized kill switch shape as execution-state control rather than trade sizing
  policy. Updated CLI role: it is not only a human administration surface; AI traders can use it to
  pause, resume, inspect status, and run diagnostics.
- Sources: conversation; no external sources.
- Decisions: Support daemon states such as active, paused/read-only, and stopped; pause/resume can
  be triggered by human, AI trader script through SDK, or AI trader through CLI; CLI is an AI trader
  control surface.
- Open questions: exact CLI names for pause/resume/read-only and whether paused and read-only are
  distinct states in v1.

## Turn 17 - V1 Kill Switch State Model - 2026-07-03 02:12 +08:00

- User signal: Accepted the v1 state model with `active` and `paused`.
- Agent work: Locked v1 kill switch scope to two runtime states. In `active`, reads and writes are
  allowed. In `paused`, read operations remain available while trading writes such as placing or
  canceling orders are rejected and audited.
- Sources: conversation; no external sources.
- Decisions: V1 daemon state model is `active` and `paused`; `readonly` is deferred.
- Open questions: none for v1 kill switch state count.

## Turn 18 - Promote V1 Architecture Spec - 2026-07-03 02:16 +08:00

- User signal: Agreed to write a consolidated v1 architecture document.
- Agent work: Begin promoting the brainstorm decisions into `docs/architecture-v1.md` as the first
  implementation-facing specification for the OKX daemon, CLI, SDK, audit logging, workspace
  layout, and AI trader operating model.
- Sources: conversation; `docs/strategy-architecture-brainstorm.md`.
- Decisions: Create a durable v1 architecture spec.
- Open questions: details may be refined during implementation, but the high-level architecture is
  ready to document.

## Turn 19 - CLI Context and NPM Package Shape - 2026-07-03 02:39 +08:00

- User signal: Move the operating manual into a CLI `context` command so agents can bootstrap from
  a one-line workspace instruction without installing a separate skill. After `init`, write basic
  guidance into `AGENTS.md` that points agents back to the CLI. Publish SDK and CLI in the same npm
  package, with CLI invokable through `npm run`. Probe npm package name availability.
- Agent work: Checked npm registry availability for candidate names and selected `okx-ai-trader`
  as the first package name because it was available and matches the AI trader concept. Planned the
  package as one npm dependency exposing both CLI bins and the Node SDK export.
- Sources: conversation; npm registry checks via `npm view`.
- Decisions: Add `okx context`; `okx init` creates or updates `AGENTS.md` and `package.json`;
  publish CLI and SDK together; recommend workspace scripts call `npm run okx -- ...`.
- Open questions: actual npm publish still requires npm account/auth and explicit publish timing.

## Turn 20 - Rename Package Candidate to okx-trader - 2026-07-03 02:43 +08:00

- User signal: Asked whether `okx-trader` is acceptable as the package name.
- Agent work: Checked npm registry availability for `okx-trader`; npm returned 404, so the name is
  currently available. Updated package metadata, CLI context, init-generated dependency, docs, and
  mock story expectations from `okx-ai-trader` to `okx-trader`.
- Sources: conversation; npm registry check via `npm view okx-trader`.
- Decisions: Use package name `okx-trader`.
- Open questions: actual npm publish still requires npm account/auth and explicit publish timing.

## Turn 21 - GitHub Action for npm Publish - 2026-07-03 02:47 +08:00

- User signal: Add a GitHub Action for publishing.
- Agent work: Added a manual `Publish npm package` workflow that installs dependencies, checks all
  `.mjs` files, runs the mock story, verifies `npm pack --dry-run`, and publishes only when the
  `publish` workflow input is true.
- Sources: conversation; repository package metadata.
- Decisions: Initially considered token-based publishing; keep publish manual via
  `workflow_dispatch`; run validation before `npm publish --access public`.
- Open questions: token-based publishing was superseded by the trusted publishing decision in
  Turn 22.

## Turn 22 - Switch Publishing to npm Trusted Publishing - 2026-07-03 02:49 +08:00

- User signal: Use trust.
- Agent work: Switched the GitHub Action from token-based npm publishing to npm Trusted Publishing
  through GitHub Actions OIDC. Added `id-token: write`, removed long-lived token usage, raised the
  workflow Node version, and documented the npm trusted publisher setup.
- Sources: conversation; npm Trusted Publishing docs.
- Decisions: Use trusted publishing, not a long-lived npm token; publish remains manually triggered
  by `workflow_dispatch`.
- Open questions: npmjs.com still needs the trusted publisher entry for `miserylee/okx` and
  workflow filename `publish.yml`.

## Turn 23 - Publish on Version Tag Push - 2026-07-03 02:58 +08:00

- User signal: npm trusted publishing has been configured; push code to trigger one version
  release.
- Agent work: Updated the publish workflow so pushing a `v*` tag automatically publishes through
  trusted publishing, while keeping the manual workflow option. Adjusted the mock story cleanup so
  it only removes its own temporary workspace/home directories.
- Sources: conversation; local workflow implementation.
- Decisions: Use `v*` tags as the automatic release trigger; publish `okx-trader@0.1.0` with
  `v0.1.0`.
- Open questions: GitHub Actions result must be checked after pushing the tag.

## Turn 24 - Main Push Release Fallback - 2026-07-03 03:04 +08:00

- User signal: The first tag-triggered trusted publishing run failed and needed repair.
- Agent work: Removed token-style npm registry setup from the workflow so npm can use OIDC trusted
  publishing. Added `main` push as a release trigger and a package-version existence check so the
  workflow publishes only when the current package version is not already on npm.
- Sources: GitHub Actions failed run logs; local workflow implementation.
- Decisions: Future pushes to `main` and `v*` tags run validation; publish happens only when
  `package.json` version is new on npm.
- Open questions: Confirm the next GitHub Actions run publishes `okx-trader@0.1.0`.

## Turn 25 - CLI Direct Daemon Operations - 2026-07-03 03:31 +08:00

- User signal: The CLI should also be able to access the daemon so agents can directly fetch data
  and buy/sell without writing a separate script first.
- Agent work: Added CLI commands for daemon state, market ticker/candles, account balance, open
  orders, placing orders, and canceling orders. CLI daemon requests carry `env` and `source` into
  audit logs, defaulting to `sandbox` and `cli`.
- Sources: conversation; daemon API implementation; mock story.
- Decisions: CLI is both daemon management surface and direct agent operation surface; live CLI
  trading requires explicit `--env live`; agents should pass meaningful `--source` labels.
- Open questions: none.

## Turn 26 - Watchlist and Richer Agent Context, Superseded - 2026-07-03 03:48 +08:00

- User signal: Add an interface for viewing the watchlist, and make `context` detailed enough to
  tell agents how to use the API, CLI, SDK, write scripts, and ask humans for decision guidance.
- Agent work: Planned a read-only watchlist surface backed by workspace config, with daemon API,
  CLI, SDK, mock story, and documentation coverage. Expanded `okx context` into the primary agent
  operating manual rather than a short bootstrap note.
- Sources: conversation; existing daemon, CLI, SDK, and context implementation.
- Decisions: This local workspace watchlist design was later rejected in Turn 29. Do not treat
  `watchlist` as an active local configuration concept.
- Open questions: whether OKX has an official account self-selected/favorites API remains
  unimplemented until verified against official docs.

## Turn 27 - AI Trader Leads the Workflow - 2026-07-03 03:58 +08:00

- User signal: The context still sounded too much like an assistant manual. The desired model is an
  AI trader leading the human through trading: the human gives ideas, preferences, and strategy
  direction; the trader researches, learns, senses market sentiment, understands indicators, writes
  scripts, implements details, and reports back.
- Agent work: Updated the context manual to add an explicit AI trader mandate, market research and
  sensing loop, and a human collaboration model where the trader brings recommendations instead of
  asking the human to design the strategy step by step.
- Sources: conversation; `okx context` implementation.
- Decisions: Future agent guidance should frame the agent as an accountable trader with initiative,
  research responsibility, strategy implementation ownership, and durable handoff duties.
- Open questions: none.

## Turn 28 - Credentials Mean Operational Trust - 2026-07-03 04:03 +08:00

- User signal: Once the human starts a trader and gives it API keys, that is sufficient trust. The
  trader should not repeatedly bother the human for decisions.
- Agent work: Tightened the context manual's trust model so routine entries, exits, indicator
  choices, and implementation details belong to the AI trader. Human questions should be reserved
  for high-level preferences, changed mandate, missing credentials, or abnormal risk outside the
  current strategy.
- Sources: conversation; `okx context` implementation.
- Decisions: Treat credentials plus a running trader workspace as operational authorization for
  autonomous trading within the recorded workspace intent. `--env live` remains an auditable
  technical selector, not a per-trade human approval requirement.
- Open questions: none.

## Turn 29 - Do Not Invent Local Trading Config - 2026-07-03 04:16 +08:00

- User signal: The watchlist implementation should not have been stored in a local file. The user
  does not need a local observation pool, and future config additions must be confirmed first.
- Agent work: Corrected the implementation direction by removing the local `watchlist` config/API
  concept and continuing only with real daemon/exchange surfaces such as instruments, positions,
  available balance, order preview, order history, fills, and audit review.
- Sources: conversation; official OKX v5 docs search did not surface a supported watchlist/favorite
  trading API.
- Decisions: Do not add local workspace config fields unless the user explicitly approves them.
  Do not expose a local concept under the name `watchlist`; if OKX self-selected/favorites support
  is needed later, verify an official API first.
- Open questions: none.

## Turn 30 - Track User Preferences as Trader Notes - 2026-07-03 04:20 +08:00

- User signal: If the user has instruments or themes they expect the trader to follow, the agent
  should write that down as trader notes. It does not need to be a config file.
- Agent work: Updated context guidance so research targets, temporary instrument tracking, strategy
  hypotheses, and user preferences belong under workspace docs/notes, not `okx.config.json`.
- Sources: conversation; `okx context` implementation.
- Decisions: Configuration remains a stable execution contract. Trader intent, preferences, and
  observation targets are agent-managed notes unless the user explicitly requests a durable config
  field.
- Open questions: none.
