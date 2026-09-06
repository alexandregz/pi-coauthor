# pi-coauthor

Unha extensión para o [axente de código Pi](https://github.com/earendil-works/pi)
que instala un hook de git `prepare-commit-msg` por repositorio. En cada commit engade dous trailers
de atribución á mensaxe, se non están xa presentes:

```
Co-authored-by: <PI_MODEL> <PI_MODEL@users.noreply.github.com>
Generated-By: Pi <VERSION>
```

O hook está restrinxido ao repositorio onde se lanza Pi (o mesmo modelo que o estado local `.atl`
do proxecto) — nunca toca repositorios onde Pi non executou.

> ⚠️ **Só commits feitos "dende Pi"** — os trailers engádense unicamente cando o commit se fai coa
> variábel de contorno `PI_COAUTHOR=1` presente (é dicir, `PI_COAUTHOR=1 git commit -m "..."`).
> Un commit manual (sen o marcador) **nunca** leva trailers.

---

## Como funciona

En `session_start`, a extensión escribe un hook `prepare-commit-msg` en `<repo>/.git/hooks/` e un
ficheiro de estado dinámico en `<repo>/.git/pi-coauthor.state` co modelo e a versión de Pi actuais.

O hook **non leva modelo/versión incrustados**: en cada commit le o ficheiro de estado
(`$GIT_DIR/pi-coauthor.state`) e usa os valores deses momento:

- se cambias de modelo a metade de sesión (evento `model_select`), a extensión actualiza o estado ao
  instante e o seguinte commit anota o modelo novo;
- se actualizas Pi, o `session_start` seguinte rexistra a versión nova.

No momento do commit o hook só engade as liñas que faltan, así que as mensaxes existentes/editadas e
os trailers que escribas ti nunca se duplican nin sobrescriben. Sempre sae con `0`, polo que nunca
bloquea un commit.

### O marcador `PI_COAUTHOR`

Para distinguir os commits feitos **dende Pi** dos **manuais**, o hook só actúa se a variábel de
contorno `PI_COAUTHOR` está presente no ambiente do `git commit`. Se non está, sae sen tocar a
mensaxe (`exit 0`). Así, un commit manual —con editor ou con `-m`— queda sempre intacto.

### Garantías de seguridade

- **Respecta hooks existentes** — se xa existe un `prepare-commit-msg` que non sexa de pi-coauthor,
  déixao intacto.
- **Só elimina o seu propio hook** — `pi-coauthor-off` borra o hook unicamente se leva o marcador de
  pi-coauthor.
- **Só en repositorios git** — executar Pi fóra dun repo git non fai nada.
- **Formato de trailer** — os trailers `Co-authored-by:` / `Generated-By:` seguen as convencións de
  GitHub e son idempotentes (sen duplicados).
- **Só commits de Pi** — os trailers engádense unicamente cando existe `PI_COAUTHOR=1`; un commit
  manual queda intacto.
- **Estado dinámico** — o modelo/versión anotados son os do momento do commit (ler de
  `pi-coauthor.state`), non os da instalación.

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

`prepare-commit-msg.sample` é o hook dinámico autónomo (sen valores incrustados). Instálao manualmente
xunto co seu ficheiro de estado:

```bash
cp prepare-commit-msg.sample <repo>/.git/hooks/prepare-commit-msg
chmod +x <repo>/.git/hooks/prepare-commit-msg

# Ficheiro de estado (modelo e versión actuais; o hook léo en cada commit)
cat > <repo>/.git/pi-coauthor.state <<'EOF'
PI_COAUTHOR_MODEL='deepseek-v4-flash'
PI_COAUTHOR_VERSION='0.85.1'
EOF
```

Actualiza manualmente ese ficheiro cando cambies de modelo ou versión de Pi.

---

## Uso

| Comando | Efecto |
|---------|--------|
| `/pi-coauthor` | Reinstala o hook e actualiza o estado (modelo e versión actuais) deste repositorio. |
| `/pi-coauthor-off` | Elimina o hook e o seu estado de pi-coauthor do repositorio actual. |

O hook actívase automaticamente no seguinte commit **cando se fai dende Pi**:

```bash
# Commit "dende Pi" → engade os trailers
PI_COAUTHOR=1 git commit -m "mensaxe"

# Commit manual → sen trailers (aínda que uses -m)
git commit -m "mensaxe"
```

---

## Exemplo de mensaxe de commit

```text
feat: engadir trailers de atribución

Co-authored-by: deepseek-v4-flash <deepseek-v4-flash@users.noreply.github.com>
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
