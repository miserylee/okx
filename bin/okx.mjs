#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { credentialPath, configPath, DEFAULT_CREDENTIALS, loadWorkspaceConfig, writeWorkspaceConfig } from "../src/lib/config.mjs";
import { CLI_SCRIPT_NAME, PACKAGE_NAME, renderAgentBootstrapGuide, renderAgentContext } from "../src/context/agent-manual.mjs";
import { writeCredentialsTemplate } from "../src/lib/env.mjs";
import { ensureDir, readJsonFile, resolveWorkspace, sleep, toPosixPath } from "../src/lib/paths.mjs";
import { fetchJsonWithTimeout, readHealthyRegistry, readRegistry, removeRegistry } from "../src/lib/registry.mjs";
import { runDaemon } from "../src/daemon/server.mjs";

const cliPath = fileURLToPath(import.meta.url);

async function main() {
  const argv = process.argv.slice(2);
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initWorkspace(parseOptions([subcommand, ...rest].filter(Boolean)));
    return;
  }

  if (command === "context") {
    console.log(renderAgentContext());
    return;
  }

  if (command === "daemon") {
    await daemonCommand(subcommand, parseOptions(rest));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function initWorkspace(options) {
  const workspace = resolveWorkspace(options.workspace || process.cwd());
  const name = options.name;
  if (!name) throw new Error("okx init requires --name <ai-trader-name>");

  ensureDir(workspace);
  const existing = fs.existsSync(configPath(workspace)) ? readJsonFile(configPath(workspace)) : {};
  writeWorkspaceConfig(workspace, {
    ...existing,
    name,
    credentials: {
      ...DEFAULT_CREDENTIALS,
      ...(existing.credentials || {}),
    },
  });

  for (const dir of ["strategies", "docs", "logs", "runtime"]) {
    ensureDir(path.join(workspace, dir));
  }

  const config = loadWorkspaceConfig(workspace);
  writeCredentialsTemplate(credentialPath(workspace, config, "live"));
  writeCredentialsTemplate(credentialPath(workspace, config, "sandbox"));
  updatePackageJson(workspace);
  updateGitignore(workspace);
  updateAgentsGuide(workspace);
  writeWorkspaceDoc(workspace, name);

  console.log(`Initialized OKX AI trader workspace: ${name}`);
  console.log(`Workspace: ${workspace}`);
}

async function daemonCommand(subcommand, options) {
  if (!subcommand) throw new Error("Missing daemon subcommand");
  const workspace = resolveWorkspace(options.workspace || process.cwd());

  if (subcommand === "serve") {
    await runDaemon({ workspace });
    return;
  }

  if (subcommand === "start") {
    await startDaemon(workspace);
    return;
  }
  if (subcommand === "stop") {
    await stopDaemon(workspace);
    return;
  }
  if (subcommand === "restart") {
    await stopDaemon(workspace, { quiet: true });
    await startDaemon(workspace);
    return;
  }
  if (subcommand === "status") {
    await statusDaemon(workspace);
    return;
  }
  if (subcommand === "doctor") {
    await doctorDaemon(workspace);
    return;
  }
  if (subcommand === "pause") {
    await controlDaemon(workspace, "pause", options.reason || "");
    return;
  }
  if (subcommand === "resume") {
    await controlDaemon(workspace, "resume", options.reason || "");
    return;
  }

  throw new Error(`Unknown daemon subcommand: ${subcommand}`);
}

async function startDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const current = await readHealthyRegistry(config.name);
  if (current.healthy) {
    console.log(`Daemon already running: ${current.registry.baseUrl}`);
    return;
  }
  if (current.registry) removeRegistry(config.name);

  ensureDir(path.join(workspace, "runtime"));
  const logPath = path.join(workspace, "runtime", "daemon.log");
  const out = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [cliPath, "daemon", "serve", "--workspace", workspace], {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
    windowsHide: true,
  });
  child.unref();

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await readHealthyRegistry(config.name);
    if (result.healthy) {
      console.log(`Daemon started: ${result.registry.baseUrl}`);
      return;
    }
    await sleep(100);
  }

  throw new Error(`Daemon did not start. Check ${logPath}`);
}

async function stopDaemon(workspace, { quiet = false } = {}) {
  const config = loadWorkspaceConfig(workspace);
  const registry = readRegistry(config.name);
  if (!registry) {
    if (!quiet) console.log("Daemon is not running");
    return;
  }

  if (registry.baseUrl) {
    try {
      await fetchJsonWithTimeout(`${registry.baseUrl}/v1/internal/shutdown`, {
        method: "POST",
        timeoutMs: 1_000,
      });
    } catch {
      // Fall back to pid signal below.
    }
  }

  if (registry.pid && isProcessRunning(registry.pid)) {
    try {
      process.kill(registry.pid, "SIGTERM");
    } catch {
      // The daemon may have already exited after the shutdown request.
    }
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await readHealthyRegistry(config.name);
    if (!current.healthy) break;
    await sleep(100);
  }
  removeRegistry(config.name);
  if (!quiet) console.log("Daemon stopped");
}

async function statusDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const result = await readHealthyRegistry(config.name);
  console.log(
    JSON.stringify(
      {
        running: result.healthy,
        registry: result.registry,
        health: result.health,
      },
      null,
      2,
    ),
  );
}

async function doctorDaemon(workspace) {
  const config = loadWorkspaceConfig(workspace);
  const registry = await readHealthyRegistry(config.name);
  const liveCredentials = credentialPath(workspace, config, "live");
  const sandboxCredentials = credentialPath(workspace, config, "sandbox");

  console.log(
    JSON.stringify(
      {
        ok: true,
        name: config.name,
        workspace,
        exchange: config.exchange,
        credentials: {
          live: { path: toPosixPath(liveCredentials), exists: fs.existsSync(liveCredentials) },
          sandbox: {
            path: toPosixPath(sandboxCredentials),
            exists: fs.existsSync(sandboxCredentials),
          },
        },
        daemon: {
          running: registry.healthy,
          registry: registry.registry,
        },
      },
      null,
      2,
    ),
  );
}

async function controlDaemon(workspace, action, reason) {
  const config = loadWorkspaceConfig(workspace);
  const registry = readRegistry(config.name);
  if (!registry?.baseUrl) throw new Error(`Daemon is not running for ${config.name}`);
  const payload = await fetchJsonWithTimeout(`${registry.baseUrl}/v1/control/${action}`, {
    method: "POST",
    timeoutMs: 2_000,
    headers: {
      "Content-Type": "application/json",
      "x-okx-source": "cli",
    },
    body: JSON.stringify({ reason }),
  });
  console.log(JSON.stringify(payload, null, 2));
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      const [key, inlineValue] = arg.slice(2).split("=", 2);
      const value = inlineValue ?? args[index + 1];
      if (inlineValue == null) index += 1;
      options[toCamelCase(key)] = value;
    }
  }
  return options;
}

function updateGitignore(workspace) {
  const filePath = path.join(workspace, ".gitignore");
  const required = ["credentials.env", "credentials.*.env", "logs/", "runtime/", "*.log"];
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];
  const set = new Set(existing.filter(Boolean));
  let changed = false;
  for (const entry of required) {
    if (!set.has(entry)) {
      existing.push(entry);
      set.add(entry);
      changed = true;
    }
  }
  if (changed || !fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${existing.filter(Boolean).join("\n")}\n`);
  }
}

function updatePackageJson(workspace) {
  const filePath = path.join(workspace, "package.json");
  const existing = fs.existsSync(filePath) ? readJsonFile(filePath) : {};
  const next = {
    ...existing,
    private: existing.private ?? true,
    type: existing.type || "module",
    scripts: {
      ...(existing.scripts || {}),
      [CLI_SCRIPT_NAME]: "okx",
    },
    dependencies: {
      ...(existing.dependencies || {}),
      [PACKAGE_NAME]: existing.dependencies?.[PACKAGE_NAME] || "^0.1.0",
    },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

function updateAgentsGuide(workspace) {
  const filePath = path.join(workspace, "AGENTS.md");
  const start = "<!-- okx-trader:start -->";
  const end = "<!-- okx-trader:end -->";
  const section = `${start}\n${renderAgentBootstrapGuide().trim()}\n${end}`;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Agent Guide\n\n${section}\n`);
    return;
  }

  const existing = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, section)
    : `${existing.trimEnd()}\n\n${section}\n`;
  fs.writeFileSync(filePath, next);
}

function writeWorkspaceDoc(workspace, name) {
  const filePath = path.join(workspace, "docs", "okx-workspace.md");
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(
    filePath,
    [
      `# OKX Workspace: ${name}`,
      "",
      "This workspace belongs to one AI trader. Strategy scripts can connect to the local daemon",
      "through the Node SDK after the daemon is started.",
      "",
      "Useful commands:",
      "",
      "```bash",
      "npm run okx -- context",
      "npm run okx -- daemon start",
      "npm run okx -- daemon status",
      "npm run okx -- daemon pause --reason \"manual pause\"",
      "npm run okx -- daemon resume --reason \"manual resume\"",
      "npm run okx -- daemon stop",
      "```",
      "",
      "Credential files are local-only and ignored by git:",
      "",
      "- `credentials.env`",
      "- `credentials.sandbox.env`",
      "",
    ].join("\n"),
  );
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printHelp() {
  console.log(`OKX AI trader daemon

Usage:
  okx context
  okx init --name <ai-trader-name>
  okx daemon start
  okx daemon stop
  okx daemon restart
  okx daemon status
  okx daemon doctor
  okx daemon pause --reason "..."
  okx daemon resume --reason "..."

Options:
  --workspace <path>  Use a workspace other than the current directory.
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
