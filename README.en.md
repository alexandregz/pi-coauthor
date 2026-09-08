# pi-coauthor

A Pi extension that installs a per-repository `prepare-commit-msg` git hook. On each commit it appends
two attribution trailers to the message, when they are not already present:

```
Co-authored-by: <PI_MODEL> <PI_MODEL@pi.dev>
Generated-By: Pi <VERSION>
```

The hook is scoped to the repository where Pi is launched — it never touches repos where Pi did not run.

> ⚠️ **Only "Pi-made" commits** — trailers are appended automatically only when the commit is run by a
> Pi session (detected via `PI_SESSION_ID`, injected by the agent bash tool). A manual commit **never**
> gets trailers.

---

## How it works

On `session_start`, the extension installs a `prepare-commit-msg` hook into `<repo>/.git/hooks/`
(by default, see the `default_on` / `default_off` settings below).

The hook uses Pi's **standard mechanism**: when the agent runs a command through its bash tool, Pi
automatically injects `PI_SESSION_ID`, `PI_PROVIDER` and `PI_MODEL` into the environment. So:

- the hook knows the commit came from a Pi session because `PI_SESSION_ID` is present;
- it uses `$PI_MODEL` (the live model at that moment) for the trailer;
- it gets the version with `pi --version` (Pi does not expose `PI_VERSION` in the environment).

There is no state file and no manual markers: everything is resolved at commit time.

The hook only adds the missing lines, so existing/edited messages and any trailers you write are never
duplicated or overwritten. It always exits `0`, so it never blocks a commit.

### Standard `PI_SESSION_ID` detection

The hook distinguishes **Pi** commits from **manual** ones by checking the `PI_SESSION_ID` variable: it
only exists when the command runs through Pi's agent bash tool. Otherwise it exits without touching the
message (`exit 0`). So a manual commit — with an editor, with `-m`, or from `!` — is always left intact.

### Safety guarantees

- **Respects existing hooks** — if a non-pi-coauthor `prepare-commit-msg` already exists, it is left intact.
- **Only removes its own hook** — `off` deletes the hook only if it carries the pi-coauthor marker.
- **Only in git repositories** — running Pi outside a git repo does nothing.
- **Trailer format** — `Co-authored-by:` / `Generated-By:` follow git conventions and are idempotent
  (no duplicates).
- **Only Pi commits** — detected via `PI_SESSION_ID` (injected by the agent bash tool); a manual commit
  stays intact.
- **Live model** — the annotated model is `$PI_MODEL` at the exact commit moment, with no persistent state.

---

## Command

`/pi-coauthor [status|on|off|default_on|default_off]`

| Argument      | Effect                                                              |
|---------------|---------------------------------------------------------------------|
| *(none)*      | Same as `status`.                                                    |
| `status`      | Shows whether the hook is installed in this repo and the global default. |
| `on`          | Installs the hook for this repo (`.git`).                            |
| `off`         | Removes the hook for this repo (`.git`).                             |
| `default_on`  | Sets the global default to auto-install the hook on Pi start.         |
| `default_off` | Sets the global default to NOT auto-install the hook on Pi start.     |

**Default is `default_on`**, so on Pi start in a git repo the hook is installed automatically (unless
that repo was explicitly turned `off`).

On start, the extension reports its state, e.g.:

```
pi-coauthor: hook installed (default: installs by default) [default_on]
pi-coauthor: hook not installed (default: does not install) [default_off]
```

The hook activates automatically when a commit is run by a Pi session (detected by `PI_SESSION_ID`).
Nothing needs to be prefixed:

```bash
# Pi-initiated commit (agent) → trailers added automatically
git commit -m "message"

# Manual commit (your console or `!`) → no trailers
git commit -m "message"
```

---

## Installation

### Option A — package from GitHub (recommended)

The repo is an installable package: it contains a `package.json` with the `pi.extensions` field, so Pi
recognizes it automatically as an extension directory. Clone it into Pi's global extensions directory:

```bash
git clone git@github.com:alexandregz/pi-coauthor.git ~/.pi/agent/extensions/pi-coauthor
```

Restart Pi (or open a new session). The hook is installed automatically on `session_start` inside any
repo where Pi starts. To update:

```bash
cd ~/.pi/agent/extensions/pi-coauthor && git pull
```

### Option B — single file

Place `pi-coauthor.ts` directly into the extensions directory Pi auto-discovers
(`~/.pi/agent/extensions/`). Useful if you don't want to clone the whole repo, but you won't get
updates via `git pull`.

### Option C — manual sample hook

`prepare-commit-msg.sample` is the self-contained hook (no embedded values). Install it manually:

```bash
cp prepare-commit-msg.sample <repo>/.git/hooks/prepare-commit-msg
chmod +x <repo>/.git/hooks/prepare-commit-msg
```

Notes for manual install: the hook only acts on commits run by Pi's agent bash tool (which injects
`PI_SESSION_ID` and `PI_MODEL`). A commit from your own console will not get trailers.

---

## Example commit message

```text
feat: add attribution trailers

Co-authored-by: deepseek-v4-flash <deepseek-v4-flash@pi.dev>
Generated-By: Pi 0.85.1
```

---

## Project structure

```
pi-coauthor.ts                 Pi extension (TypeScript) that installs/removes the hook
prepare-commit-msg.sample      Self-contained sample hook (manual install)
package.json                   Pi manifest (field `pi.extensions`) — makes the repo clonable
README.md                      Documentation (Galician)
README.en.md                   Documentation (English)
LICENSE
.gitignore
```

---

## Packaging

The repo is a Pi extension package installable by `git clone`. The key is the `package.json`:

```json
{
  "name": "pi-coauthor",
  "pi": {
    "extensions": ["pi-coauthor.ts"]
  }
}
```

Pi discovers extensions in a subdirectory of `~/.pi/agent/extensions/` if it contains an `index.ts` or
a `package.json` with the `pi.extensions` field (array of paths). When the repo is cloned into that
directory, Pi reads the manifest and loads `pi-coauthor.ts` automatically.

## Development notes

- Replicates the behavior of https://github.com/bruno-garcia/pi-co-authored-by, because it captures the
  commit and does not work with certain packages (like `gentle-ai`).
- Extension types come from `@earendil-works/pi-coding-agent`.
- Install/remove uses the `session_start` event and the registered `pi-coauthor` command with the
  `status | on | off | default_on | default_off` arguments.
- `ctx.hasUI` toggles between interactive notifications (`ctx.ui.notify`) and console output.

## License

MIT.