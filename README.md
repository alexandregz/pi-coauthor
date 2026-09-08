# pi-coauthor

Unha extensión para o [axente de código Pi](https://github.com/earendil-works/pi)
que instala un hook de git `prepare-commit-msg` por repositorio. En cada commit engade dous trailers
de atribución á mensaxe, se non están xa presentes:

```
Co-authored-by: <PI_MODEL> <PI_MODEL@pi.dev>
Generated-By: Pi <VERSION>
```

O hook está restrinxido ao repositorio onde se lanza Pi (o mesmo modelo que o estado local `.atl`
do proxecto) — nunca toca repositorios onde Pi non executou.

> ⚠️ **Só commits feitos "dende Pi"** — os trailers engádense automaticamente cando o commit o
> executa unha sesión de Pi (detectada mediante `PI_SESSION_ID`, que inxecta o bash tool do
> axente). Un commit manual **nunca** leva trailers.

---

## Como funciona

En `session_start`, a extensión escribe un hook `prepare-commit-msg` en `<repo>/.git/hooks/`.

O hook usa o mecanismo **estándar de Pi**: cando o axente executa unha orde co seu bash tool, Pi
inxecta automaticamente no ambiente `PI_SESSION_ID`, `PI_PROVIDER` e `PI_MODEL`. Así:

- o hook sabe que o commit veu dunha sesión de Pi porque `PI_SESSION_ID` está presente;
- usa `$PI_MODEL` (o modelo vivo do momento) para o trailer;
- obtén a versión con `pi --version` (Pi non expón `PI_VERSION` no ambiente).

Non hai ficheiro de estado nin marcadores manuais: todo se resolve no momento do commit.

No momento do commit o hook só engade as liñas que faltan, así que as mensaxes existentes/editadas e
os trailers que escribas ti nunca se duplican nin sobrescriben. Sempre sae con `0`, polo que nunca
bloquea un commit.

### Detección estándar `PI_SESSION_ID`

O hook distingue os commits **dende Pi** dos **manuais** comprobando a variábel `PI_SESSION_ID`:
só existe cando a orde a executa o bash tool do axente de Pi. Se non está, sae sen tocar a mensaxe
(`exit 0`). Así, un commit manual —con editor, con `-m` ou desde `!`— queda sempre intacto.

### Garantías de seguridade

- **Respecta hooks existentes** — se xa existe un `prepare-commit-msg` que non sexa de pi-coauthor,
  déixao intacto.
- **Só elimina o seu propio hook** — `pi-coauthor-off` borra o hook unicamente se leva o marcador de
  pi-coauthor.
- **Só en repositorios git** — executar Pi fóra dun repo git non fai nada.
- **Formato de trailer** — os trailers `Co-authored-by:` / `Generated-By:` seguen as convencións de
  GitHub e son idempotentes (sen duplicados).
- **Só commits de Pi** — detectados mediante `PI_SESSION_ID` (inxectado polo bash tool do axente);
  un commit manual queda intacto.
- **Modelo vivo** — anótase `$PI_MODEL` do momento exacto do commit, sen estado persistente.

---

## Instalación

### Opción A — paquete dende GitHub (recomendada)

O repo é un paquete instalable: contén un `package.json` co campo `pi.extensions`, así que Pi o
recoñece automaticamente como directorio de extensión. Clona o repo no directorio global de
extensións de Pi:

```bash
git clone git@github.com:alexandregz/pi-coauthor.git ~/.pi/agent/extensions/pi-coauthor
```

Reinicia Pi (ou abre unha sesión nova). O hook instálase automaticamente en `session_start` dentro
de calquera repo onde arrinque Pi. Para actualizar:

```bash
cd ~/.pi/agent/extensions/pi-coauthor && git pull
```

### Opción B — ficheiro único

Coloca `pi-coauthor.ts` directamente no directorio de extensións que Pi descubre automaticamente
(`~/.pi/agent/extensions/`). Útil se non queres clonar o repo enteiro, pero non terás updates por
`git pull`.

### Opción C — hook de mostra manual

`prepare-commit-msg.sample` é o hook autónomo (sen valores incrustados). Instálao manualmente:

```bash
cp prepare-commit-msg.sample <repo>/.git/hooks/prepare-commit-msg
chmod +x <repo>/.git/hooks/prepare-commit-msg
```

Notas da instalación manual: o hook só actúa nos commits que executa o bash tool do axente de Pi
(que inxecta `PI_SESSION_ID` e `PI_MODEL`). Un commit desde a túa consola non levará trailers.

---

## Uso

| Comando | Efecto |
|---------|--------|
| `/pi-coauthor` | Reinstala/amosa o hook estándar (detección via `PI_SESSION_ID`) neste repositorio. |
| `/pi-coauthor-off` | Elimina o hook de pi-coauthor do repositorio actual. |

O hook actívase automaticamente cando o commit o executa unha sesión de Pi (detectada por
`PI_SESSION_ID`). Non hai que prefixar nada:

```bash
# Commit "dende Pi" (o axente) → engade os trailers automaticamente
git commit -m "mensaxe"

# Commit manual (túa consola ou `!`) → sen trailers
git commit -m "mensaxe"
```

---

## Exemplo de mensaxe de commit

```text
feat: engadir trailers de atribución

Co-authored-by: deepseek-v4-flash <deepseek-v4-flash@pi.dev>
Generated-By: Pi 0.85.1
```

---

## Estrutura do proxecto

```
pi-coauthor.ts                 Extensión de Pi (TypeScript) que instala/elimina o hook
prepare-commit-msg.sample      Modelo de hook autónomo (instalación manual)
package.json                   Manifest de Pi (campo `pi.extensions`) — fai o repo clonable
README.md
LICENSE
.gitignore
```

---

## Empaquetado

O repo é un paquete de extensión de Pi instalable por `git clone`. A chave é o `package.json`:

```json
{
  "name": "pi-coauthor",
  "pi": {
    "extensions": ["pi-coauthor.ts"]
  }
}
```

Pi descubre extensións nun subdirectorio de `~/.pi/agent/extensions/` se contén un `index.ts` ou un
`package.json` co campo `pi.extensions` (array de rutas). Cando o repo se clona nese directorio, Pi
le o manifest e carga `pi-coauthor.ts` automaticamente.

## Notas de desenvolvemento

- replica o comportamento de https://github.com/bruno-garcia/pi-co-authored-by, porque captura o commit e non funciona con certos packages (como `gentle-ai`)

- Os tipos da extensión veñen de `@earendil-works/pi-coding-agent`.
- Instalación/eliminación usa o evento `session_start` e dous manexadores `registerCommand`
  (`pi-coauthor`, `pi-coauthor-off`).
- `ctx.hasUI` alterna entre notificacións interactivas (`ctx.ui.notify`) e saída por consola.

## Licenza

MIT.
