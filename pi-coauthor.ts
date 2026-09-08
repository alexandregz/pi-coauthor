import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

// pi-coauthor
// Installs a per-project `prepare-commit-msg` git hook in `.git/hooks` of the repo where Pi runs.
// Uses Pi's STANDARD mechanism: the agent bash tool injects PI_SESSION_ID and PI_MODEL into the
// commands it runs. Therefore, with no state file and no manual markers:
//   - Trailers are only added when the commit comes from a Pi session (PI_SESSION_ID present);
//   - $PI_MODEL (the live current model) and `pi --version` are used for the trailers.
// Adds, when missing:
//   Co-authored-by: <PI_MODEL> <PI_MODEL@pi.dev>
//   Generated-By: Pi <VERSION>
// Manual commits NEVER get trailers.
// Scope: only repos where Pi is launched.
//
// Command: /pi-coauthor [status|on|off|default_on|default_off]
//   status      Show whether the hook is installed here and the global default.
//   on          Install the hook for this repo (.git) and remember this repo as on.
//   off         Remove the hook for this repo (.git) and remember this repo as off.
//   default_on  Set the global default to auto-install the hook on Pi start (default).
//   default_off Set the global default to NOT auto-install the hook on Pi start.

const MARKER = "# Installed by pi-coauthor";
const HOOK_NAME = "prepare-commit-msg";

const GLOBAL_CONFIG = join(homedir(), ".pi", "agent", "pi-coauthor.json");
const DEFAULT_ON = true; // global default: default_on

// Per-repo override markers stored inside the git dir (.git).
const ON_MARKER = "pi-coauthor.on";
const OFF_MARKER = "pi-coauthor.off";

interface GlobalConfig {
  defaultOn: boolean;
}

let cachedVersion: string | null = null;

function piVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = execFileSync("pi", ["--version"], { encoding: "utf8" }).trim() || "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
}

// Resolve the hooks dir of the git repo containing `cwd`, or null if not a git repo.
function hooksDir(cwd: string): string | null {
  try {
    const top = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const gitDir = execFileSync("git", ["-C", cwd, "rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
    const absGitDir = gitDir.startsWith("/") ? gitDir : join(top, gitDir);
    return join(absGitDir, "hooks");
  } catch {
    return null;
  }
}

function gitDirOf(cwd: string): string | null {
  try {
    const top = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const gitDir = execFileSync("git", ["-C", cwd, "rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
    return gitDir.startsWith("/") ? gitDir : join(top, gitDir);
  } catch {
    return null;
  }
}

// Hook content. Standard Pi detection (PI_SESSION_ID) + live model ($PI_MODEL) + version via `pi --version`.
function hookScript(): string {
  // Literal SHELL text (${MODEL} / ${VERSION}) — not JS variables.
  const modelShell = "${MODEL}";
  const versionShell = "${VERSION}";
  return [
    "#!/bin/sh",
    `${MARKER}. Don't remove by hand; use /pi-coauthor off.`,
    "# Standard detection: this command runs through Pi's agent bash tool, which",
    "# injects PI_SESSION_ID and PI_MODEL. If they are absent, it's a manual commit.",
    '[ -n "${PI_SESSION_ID:-}" ] || exit 0',
    'MODEL="${PI_MODEL:-}"',
    '[ -n "$MODEL" ] || exit 0',
    'VERSION="$(pi --version 2>/dev/null | tr -d "[:space:]")"',
    '[ -n "$VERSION" ] || VERSION="unknown"',
    'MSG="$1"',
    // Blank line before the first trailer (git trailer convention)
    `if ! grep -q "^Co-authored-by: ${modelShell} <${modelShell}@pi.dev>$" "$MSG"; then`,
    '  [ -n "$(tail -n 1 "$MSG")" ] && printf "\\n" >> "$MSG"',
    `  printf '%s\\n' "Co-authored-by: ${modelShell} <${modelShell}@pi.dev>" >> "$MSG"`,
    'fi',
    `grep -q "^Generated-By: Pi ${versionShell}$" "$MSG" || printf '%s\\n' "Generated-By: Pi ${versionShell}" >> "$MSG"`,
    "exit 0",
    "",
  ].join("\n");
}

// Reliable active model for display only (the hook itself uses $PI_MODEL from the env).
function activeModel(ctx: ExtensionContext): string {
  return ctx.model?.id || process.env.PI_MODEL || "ai";
}

// --- Global default persistence (default_on / default_off) ---

function readGlobalDefault(): boolean {
  try {
    if (existsSync(GLOBAL_CONFIG)) {
      const raw = JSON.parse(readFileSyncSafe(GLOBAL_CONFIG));
      if (typeof raw?.defaultOn === "boolean") return raw.defaultOn;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ON;
}

function readFileSyncSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "{}";
  }
}

function writeGlobalDefault(defaultOn: boolean): void {
  const cfg: GlobalConfig = { defaultOn };
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  writeFileSync(GLOBAL_CONFIG, JSON.stringify(cfg, null, 2), "utf8");
}

// --- Per-repo override markers ---

function repoOnMarker(gitDir: string): string {
  return join(gitDir, ON_MARKER);
}
function repoOffMarker(gitDir: string): string {
  return join(gitDir, OFF_MARKER);
}

function setRepoOn(gitDir: string): void {
  writeFileSync(repoOnMarker(gitDir), "", "utf8");
  try {
    unlink(repoOffMarker(gitDir));
  } catch {
    /* ignore */
  }
}

function setRepoOff(gitDir: string): void {
  writeFileSync(repoOffMarker(gitDir), "", "utf8");
  try {
    unlink(repoOnMarker(gitDir));
  } catch {
    /* ignore */
  }
}

// Whether the hook should be installed in this repo given the global default.
function shouldInstall(cwd: string): boolean {
  const gitDir = gitDirOf(cwd);
  if (gitDir) {
    // Explicit per-repo override wins over the global default.
    if (existsSync(repoOffMarker(gitDir))) return false;
    if (existsSync(repoOnMarker(gitDir))) return true;
  }
  return readGlobalDefault();
}

async function isHookInstalled(cwd: string): Promise<boolean> {
  const hooks = hooksDir(cwd);
  if (!hooks) return false;
  try {
    const existing = await readFile(join(hooks, HOOK_NAME), "utf8");
    return existing.includes(MARKER);
  } catch {
    return false;
  }
}

async function installHook(pi: ExtensionAPI, ctx: ExtensionContext): Promise<boolean> {
  const hooks = hooksDir(ctx.cwd);
  if (!hooks) {
    // Not a git repo: nothing to do (scope is only where Pi runs inside a repo).
    return false;
  }

  const model = activeModel(ctx);
  const target = join(hooks, HOOK_NAME);

  // Respect an existing non-pi-coauthor hook (do not overwrite).
  try {
    const existing = await readFile(target, "utf8");
    if (!existing.includes(MARKER)) {
      console.log("pi-coauthor: an existing non-pi-coauthor prepare-commit-msg was found; not overwriting it.");
      return true;
    }
  } catch {
    // does not exist: continue
  }

  await writeFile(target, hookScript(), { encoding: "utf8" });
  await chmod(target, 0o755);

  notify(ctx, `pi-coauthor: hook installed (model=${model})`, "success");
  return true;
}

async function removeHook(ctx: ExtensionContext): Promise<void> {
  const hooks = hooksDir(ctx.cwd);
  const target = hooks ? join(hooks, HOOK_NAME) : null;
  if (target) {
    try {
      const existing = await readFile(target, "utf8");
      if (existing.includes(MARKER)) {
        await unlink(target);
        notify(ctx, "pi-coauthor: hook removed", "success");
        return;
      }
    } catch {
      /* not present */
    }
  }
  notify(ctx, "pi-coauthor: no pi-coauthor hook present", "info");
}

function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
  } else {
    console.log(message);
  }
}

async function handleStartup(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const gitDir = gitDirOf(ctx.cwd);
  if (!gitDir) return; // not a git repo

  const on = shouldInstall(ctx.cwd);
  const installed = await isHookInstalled(ctx.cwd);

  if (on) {
    if (installed) {
      const model = activeModel(ctx);
      notify(ctx, `pi-coauthor: hook already installed (model=${model}) [default_on]`, "info");
    } else {
      await installHook(pi, ctx);
    }
  } else {
    // default_off (or repo forced off): ensure not installed by us.
    const hooks = hooksDir(ctx.cwd);
    if (hooks) {
      try {
        const existing = await readFile(join(hooks, HOOK_NAME), "utf8");
        if (existing.includes(MARKER)) {
          await unlink(join(hooks, HOOK_NAME));
        }
      } catch {
        /* not present */
      }
    }
    notify(ctx, "pi-coauthor: hook not installed (default: does not install) [default_off]", "info");
  }
}

async function handleCommand(pi: ExtensionAPI, ctx: ExtensionContext, arg: string): Promise<void> {
  const gitDir = gitDirOf(ctx.cwd);
  const cmd = (arg || "status").trim().toLowerCase();

  switch (cmd) {
    case "on": {
      if (!gitDir) {
        notify(ctx, "pi-coauthor: not a git repository", "warning");
        return;
      }
      setRepoOn(gitDir);
      await installHook(pi, ctx);
      notify(ctx, "pi-coauthor: enabled for this repo", "success");
      return;
    }
    case "off": {
      if (!gitDir) {
        notify(ctx, "pi-coauthor: not a git repository", "warning");
        return;
      }
      setRepoOff(gitDir);
      await removeHook(ctx);
      return;
    }
    case "default_on": {
      writeGlobalDefault(true);
      notify(ctx, "pi-coauthor: default set to install the hook on Pi start [default_on]", "success");
      return;
    }
    case "default_off": {
      writeGlobalDefault(false);
      // Ensure we don't leave a stale per-repo "on" override globally; repaint current repo.
      if (gitDir) {
        try {
          unlink(repoOnMarker(gitDir));
        } catch {
          /* ignore */
        }
      }
      notify(ctx, "pi-coauthor: default set to NOT install the hook on Pi start [default_off]", "success");
      return;
    }
    case "status":
    default: {
      const installed = await isHookInstalled(ctx.cwd);
      const def = readGlobalDefault();
      const forced = gitDir
        ? existsSync(repoOnMarker(gitDir))
          ? "on"
          : existsSync(repoOffMarker(gitDir))
            ? "off"
            : "default"
        : "n/a";
      notify(
        ctx,
        `pi-coauthor: installed=${installed}, default=${def ? "default_on" : "default_off"}, this repo=${forced}`,
        "info",
      );
      return;
    }
  }
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    // Allow the startup behavior to be overridden during tests/debug via env.
    if (process.env.PI_COAUTHOR_SKIP_STARTUP === "1") return;
    await handleStartup(pi, ctx);
  });

  pi.registerCommand("pi-coauthor", {
    description: "Manage the pi-coauthor commit hook: [status|on|off|default_on|default_off]",
    getArgumentCompletions: (prefix: string) => {
      const opts = ["status", "on", "off", "default_on", "default_off"];
      return opts.filter((o) => (prefix || "status") === "" || o.startsWith(prefix)).map((value) => ({ value }));
    },
    handler: async (args: string, ctx) => {
      await handleCommand(pi, ctx, args);
    },
  });
}