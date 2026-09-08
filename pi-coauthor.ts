import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// pi-coauthor
// Instala un hook `prepare-commit-msg` por proxecto (no `.git/hooks` do repo onde Pi se lanza,
// igual que se fai co `.atl`).
// O hook usa o mecanismo ESTÁNDAR de Pi: o bash tool do axente inxecta PI_SESSION_ID e PI_MODEL
// nas ordes que executa. Por iso, sen estado nin marcadores manuais:
//   - Só engade trailers cando o commit provén dunha sesión de Pi (PI_SESSION_ID presente);
//   - usa $PI_MODEL (o modelo vivo do momento) e `pi --version` para a versión.
// Engade aos commits dende Pi, se non están:
//   Co-authored-by: <PI_MODEL> <PI_MODEL@pi.dev>
//   Generated-By: Pi <VERSION>
// Os commits manuais NUNCA levan trailers.
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

// Contido do hook. Detección estándar de Pi (PI_SESSION_ID) + modelo vivo ($PI_MODEL) + versión via `pi --version`.
function hookScript(): string {
  // Texto literal SHELL (${MODEL} / ${VERSION}) — non son variábeis JS.
  const modelShell = "${MODEL}";
  const versionShell = "${VERSION}";
  return [
    "#!/bin/sh",
    `${MARKER}. Non borres a man; usa /pi-coauthor-off.`,
    "# Detección estándar: esta orde execútaa o bash tool do axente de Pi, que",
    "# inxecta PI_SESSION_ID e PI_MODEL. Se non os hai, é un commit manual.",
    '[ -n "${PI_SESSION_ID:-}" ] || exit 0',
    'MODEL="${PI_MODEL:-}"',
    '[ -n "$MODEL" ] || exit 0',
    'VERSION="$(pi --version 2>/dev/null | tr -d "[:space:]")"',
    '[ -n "$VERSION" ] || VERSION="unknown"',
    'MSG="$1"',
    // Liña en branco antes do primeiro trailer (convención de trailers de git)
    `if ! grep -q "^Co-authored-by: ${modelShell} <${modelShell}@pi.dev>$" "$MSG"; then`,
    '  [ -n "$(tail -n 1 "$MSG")" ] && printf "\\n" >> "$MSG"',
    `  printf '%s\\n' "Co-authored-by: ${modelShell} <${modelShell}@pi.dev>" >> "$MSG"`
    'fi',
    `grep -q "^Generated-By: Pi ${versionShell}$" "$MSG" || printf '%s\\n' "Generated-By: Pi ${versionShell}" >> "$MSG"`,
    "exit 0",
    "",
  ].join("\n");
}

// Fonte fiable do modelo activo da sesión (só para display; o hook usa $PI_MODEL do env).
function activeModel(ctx: ExtensionContext): string {
  return ctx.model?.id || process.env.PI_MODEL || "ai";
}

async function installHook(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const hooks = hooksDir(ctx.cwd);
  if (!hooks) return; // non é repo git: nada que facer (scope só onde Pi corre nun repo)

  const model = activeModel(ctx);
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

  await writeFile(target, hookScript(), { encoding: "utf8" });
  await chmod(target, 0o755);

  if (ctx.hasUI) {
    ctx.ui.notify(`pi-coauthor: hook estándar instalado (model=${model})`, "success");
  } else {
    console.log(`pi-coauthor: hook instalado en ${target} (model=${model})`);
  }
}

export default function (pi: ExtensionAPI): void {
  // Instalar ao arrincar Pi nun repo (patrón session_start; non na factory).
  pi.on("session_start", async (_event, ctx) => {
    await installHook(pi, ctx);
  });

  // Reinstalar / amosar estado
  pi.registerCommand("pi-coauthor", {
    description: "Reinstala/amosa o hook estándar de Pi neste repo",
    handler: async (_args, ctx) => {
      const model = activeModel(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(`pi-coauthor: model=${model} (detección via PI_SESSION_ID)`, "info");
      } else {
        console.log(`pi-coauthor: model=${model}`);
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