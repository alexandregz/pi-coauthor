import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, chmod, unlink } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// pi-coauthor
// Instala un hook `prepare-commit-msg` por proxecto (no `.git/hooks` do repo onde Pi se lanza,
// igual que se fai co `.atl`). O hook é DINÁMICO: non leva modelo/versión incrustados; en cada
// commit le o ficheiro de estado `<gitdir>/pi-coauthor.state`, que a extensión mantén actualizado
// en `session_start` e cando cambia o modelo (`model_select`).
// Engade aos commits feitos "dende Pi" (PI_COAUTHOR=1), se non están:
//   Co-authored-by: <PI_MODEL> <PI_MODEL@users.noreply.github.com>
//   Generated-By: Pi <VERSION>
// Commit dende Pi:  PI_COAUTHOR=1 git commit -m "..."
// Os commits manuais NUNCA levan trailers.
// Scope: só repos onde se lanzou Pi. Para desinstalar: /pi-coauthor-off.

const MARKER = "# Instalado por pi-coauthor";
const ENV_MARKER = "PI_COAUTHOR";
const HOOK_NAME = "prepare-commit-msg";
const STATE_NAME = "pi-coauthor.state";

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

// Contido do hook. NON contén modelo/versión: resólveos no momento do commit
// lendo `$GIT_DIR/pi-coauthor.state` (actualizado pola extensión en session_start/model_select).
function hookScript(): string {
  const coauthorVar = "${PI_COAUTHOR_MODEL} <${PI_COAUTHOR_MODEL}@users.noreply.github.com>";
  const genbyVar = "Pi ${PI_COAUTHOR_VERSION}";
  return [
    "#!/bin/sh",
    `${MARKER}. Non borres a man; usa /pi-coauthor-off.`,
    "# Hook dinámico: modelo/versión lidos de $GIT_DIR/pi-coauthor.state",
    "# Ficheiro xerado pola extensión en session_start e actualizado en model_select.",
    // Commit manual (sen o marcador PI_COAUTHOR): saír sen tocar a mensaxe.
    'if [ -z "${PI_COAUTHOR:-}" ]; then exit 0; fi',
    'state="${GIT_DIR:-$(git rev-parse --git-dir)}/pi-coauthor.state"',
    'if [ ! -f "$state" ]; then exit 0; fi',
    '. "$state"',
    '[ -n "$PI_COAUTHOR_MODEL" ] || exit 0',
    'MSG="$1"',
    // Garantir unha liña en branco entre a mensaxe e o primeiro trailer.
    `if ! grep -q "^Co-authored-by: ${coauthorVar}$" "$MSG"; then`,
    '  # Liña en branco antes do primeiro trailer (convención de trailers de git)',
    '  [ -n "$(tail -n 1 "$MSG")" ] && printf "\\n" >> "$MSG"',
    `  printf '%s\\n' "Co-authored-by: ${coauthorVar}" >> "$MSG"`,
    'fi',
    '[ -n "$PI_COAUTHOR_VERSION" ] || { echo "Generated-By: Pi ${PI_COAUTHOR_VERSION}" >> "$MSG"; exit 0; }',
    `grep -q "^Generated-By: ${genbyVar}$" "$MSG" || printf '%s\\n' "Generated-By: ${genbyVar}" >> "$MSG"`,
    "exit 0",
    "",
  ].join("\n");
}

// Fonte fiable do modelo activo da sesión.
function activeModel(ctx: ExtensionContext): string {
  return ctx.model?.id || process.env.PI_MODEL || "ai";
}

// Escribe o ficheiro de estado co modelo/versión ACTUAIS (valores dinámicos do hook).
async function writeState(hooks: string, model: string, version: string): Promise<void> {
  const stateFile = join(hooks, "..", STATE_NAME);
  const safeModel = model.replace(/'/g, "'\\''");
  const safeVersion = version.replace(/'/g, "'\\''");
  const content = [
    "# Xerado por pi-coauthor. Non editar a man: actualízase en session_start / model_select.",
    `PI_COAUTHOR_MODEL='${safeModel}'`,
    `PI_COAUTHOR_VERSION='${safeVersion}'`,
    "",
  ].join("\n");
  await writeFile(stateFile, content, { encoding: "utf8" });
  await chmod(stateFile, 0o600).catch(() => {});
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

  await writeFile(target, hookScript(), { encoding: "utf8" });
  await chmod(target, 0o755);
  await writeState(hooks, model, version);

  if (ctx.hasUI) {
    ctx.ui.notify(`pi-coauthor: hook dinámico instalado (model=${model}, ver=${version})`, "success");
  } else {
    console.log(`pi-coauthor: hook instalado en ${target} (model=${model}, ver=${version})`);
  }
}

export default function (pi: ExtensionAPI): void {
  // Instalar ao arrincar Pi nun repo (patrón session_start; non na factory).
  pi.on("session_start", async (_event, ctx) => {
    await installHook(pi, ctx);
  });

  // Cambio de modelo a metade de sesión: actualiza o estado AHORA MESMO,
  // para que o seguinte commit anote o modelo/versión correctos.
  pi.on("model_select", async (event: { model?: { id?: string } }, ctx) => {
    const hooks = hooksDir(ctx.cwd);
    if (!hooks) return;
    const model = event.model?.id || activeModel(ctx);
    await writeState(hooks, model, piVersion());
    if (ctx.hasUI) ctx.ui.notify(`pi-coauthor: modelo actualizado a ${model}`, "info");
    else console.log(`pi-coauthor: estado actualizado (model=${model})`);
  });

  // Reinstalar / actualizar estado
  pi.registerCommand("pi-coauthor", {
    description: "Reinstala/actualiza o hook dinámico e o estado neste repo",
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

  // Desinstalar (borra o hook e o estado se son nosos)
  pi.registerCommand("pi-coauthor-off", {
    description: "Quita o hook co-autor de Pi e o seu estado deste repo",
    handler: async (_args, ctx) => {
      const hooks = hooksDir(ctx.cwd);
      const target = hooks ? join(hooks, HOOK_NAME) : null;
      let removed = false;
      if (target) {
        try {
          const existing = await readFile(target, "utf8");
          if (existing.includes(MARKER)) {
            await unlink(target);
            removed = true;
          }
        } catch {
          /* non existe */
        }
      }
      if (hooks) {
        try {
          await unlink(join(hooks, "..", STATE_NAME));
          removed = true;
        } catch {
          /* sen estado */
        }
      }
      if (ctx.hasUI) {
        ctx.ui.notify(
          removed ? "pi-coauthor: hook e estado eliminados" : "pi-coauthor: non había hook noso",
          removed ? "success" : "info",
        );
      } else {
        console.log(removed ? "pi-coauthor: hook e estado eliminados" : "pi-coauthor: non había hook noso");
      }
    },
  });
}