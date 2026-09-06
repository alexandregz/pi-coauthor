import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// pi-coauthor
// Instala un hook `prepare-commit-msg` por proxecto (no `.git/hooks` do repo onde Pi se lanza,
// igual que se fai co `.atl`) que engade ós commits, se non están:
//   Co-authored-by: <PI_MODEL> <PI_MODEL@users.noreply.github.com>
//   Generated-By: Pi <VERSION>
// Scope: só repos onde se lanzou Pi. Para desinstalar: /pi-coauthor-off.

const MARKER = "# Instalado por pi-coauthor";
const HOOK_NAME = "prepare-commit-msg";

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

// Devolve o directorio de hooks do repo git que contén `cwd`, ou null se non é repo git.
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

// Contido do hook (os valores quedan incrustados ao instalalo).
function hookScript(model: string, version: string): string {
  const coauthor = `Co-authored-by: ${model} <${model}@users.noreply.github.com>`;
  const genby = `Generated-By: Pi ${version}`;
  return [
    "#!/bin/sh",
    `${MARKER}. Non borres a man; usa /pi-coauthor-off.`,
    'MSG="$1"',
    `grep -q "^${coauthor}$" "$MSG" || printf '%s\\n' '${coauthor}' >> "$MSG"`,
    `grep -q "^${genby}$" "$MSG" || printf '%s\\n' '${genby}' >> "$MSG"`,
    "exit 0",
    "",
  ].join("\n");
}

// Fonte fiable do modelo activo da sesión.
function activeModel(ctx: ExtensionContext): string {
  return ctx.model?.id || process.env.PI_MODEL || "ai";
}

async function installHook(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const hooks = hooksDir(ctx.cwd);
  if (!hooks) return; // non é repo git: nada que facer (scope só onde Pi corre nun repo)

  const model = activeModel(ctx);
  const version = piVersion();
  const target = join(hooks, HOOK_NAME);

  // Respectar un hook xa existente que non sexa noso (non sobrescribir)
  try {
    const existing = await readFile(target, "utf8");
    if (!existing.includes(MARKER)) {
      console.log("pi-coauthor: xa existe un prepare-commit-msg non noso; non o sobrescribín.");
      return;
    }
  } catch {
    // non existe: seguimos
  }

  await writeFile(target, hookScript(model, version), { encoding: "utf8" });
  await chmod(target, 0o755);

  if (ctx.hasUI) {
    ctx.ui.notify(`pi-coauthor: hook instalado no repo (${model})`, "success");
  } else {
    console.log(`pi-coauthor: hook instalado en ${target} (model=${model}, ver=${version})`);
  }
}

export default function (pi: ExtensionAPI): void {
  // Instalar ao arrincar Pi nun repo (patrón session_start; non na factory).
  pi.on("session_start", async (_event, ctx) => {
    await installHook(pi, ctx);
  });

  // Reinstalar / mostrar estado
  pi.registerCommand("pi-coauthor", {
    description: "Reinstala/amosa o hook co-autor de Pi neste repo",
    handler: async (_args, ctx) => {
      const model = activeModel(ctx);
      const version = piVersion();
      if (ctx.hasUI) {
        ctx.ui.notify(`pi-coauthor: model=${model}, ver=${version}`, "info");
      } else {
        console.log(`pi-coauthor: model=${model}, ver=${version}`);
      }
      await installHook(pi, ctx);
    },
  });

  // Desinstalar (borra o hook se é noso)
  pi.registerCommand("pi-coauthor-off", {
    description: "Quita o hook co-autor de Pi deste repo",
    handler: async (_args, ctx) => {
      const hooks = hooksDir(ctx.cwd);
      const target = hooks ? join(hooks, HOOK_NAME) : null;
      if (target) {
        try {
          const existing = await readFile(target, "utf8");
          if (existing.includes(MARKER)) {
            await unlink(target);
            if (ctx.hasUI) ctx.ui.notify("pi-coauthor: hook eliminado", "success");
            else console.log("pi-coauthor: hook eliminado");
            return;
          }
        } catch {
          /* non existe */
        }
      }
      if (ctx.hasUI) ctx.ui.notify("pi-coauthor: non había hook noso", "info");
      else console.log("pi-coauthor: non había hook noso");
    },
  });
}