# pi-coauthor

Unha extensión para o [axente de código Pi](https://github.com/earendil-works/pi-coding-agent)
que instala un hook de git `prepare-commit-msg` por repositorio. En cada commit engade dous trailers
de atribución á mensaxe, se non están xa presentes:

```
Co-authored-by: <PI_MODEL> <PI_MODEL@users.noreply.github.com>
Generated-By: Pi <VERSION>
```

O hook está restrinxido ao repositorio onde se lanza Pi (o mesmo modelo que o estado local `.atl`
do proxecto) — nunca toca repositorios onde Pi non executou.

---

## Como funciona

En `session_start`, a extensión detecta o modelo activo (`ctx.model.id` ou `$PI_MODEL`) e a versión
de Pi instalada (`pi --version`), e escribe un hook `prepare-commit-msg` en `<repo>/.git/hooks/`
con eses valores incrustados.

No momento do commit o hook só engade as liñas que faltan, así que as mensaxes existentes/editadas e
os trailers que escribas ti nunca se duplican nin sobrescriben. Sempre sae con `0`, polo que nunca
bloquea un commit.

### Garantías de seguridade

- **Respecta hooks existentes** — se xa existe un `prepare-commit-msg` que non sexa de pi-coauthor,
  déixao intacto.
- **Só elimina o seu propio hook** — `pi-coauthor-off` borra o hook unicamente se leva o marcador de
  pi-coauthor.
- **Só en repositorios git** — executar Pi fóra dun repo git non fai nada.
- **Formato de trailer** — os trailers `Co-authored-by:` / `Generated-By:` seguen as convencións de
  GitHub e son idempotentes (sen duplicados).

---

## Instalación

### Opción A — extensión de Pi (automática)

1. Coloca `pi-coauthor.ts` no directorio de extensións que Pi descubre automaticamente:
   `~/.pi/agent/extensions/`
2. Recarga/arrinca unha sesión de Pi dentro dun repositorio git. O hook instálase
   automaticamente.

### Opción B — hook de mostra manual

`prepare-commit-msg.sample` é un hook autónomo listo para usar, con valores concretos incrustados.
Instálao manualmente:

```bash
cp prepare-commit-msg.sample <repo>/.git/hooks/prepare-commit-msg
chmod +x <repo>/.git/hooks/prepare-commit-msg
```

Edita as liñas `Co-authored-by:` / `Generated-By:` incrustadas para que coincidan co teu modelo e
versión.

---

## Uso

| Comando | Efecto |
|---------|--------|
| `/pi-coauthor` | Reinstala/actualiza o hook do repositorio actual (incrusta o modelo e a versión activos) e amosa os valores actuais. |
| `/pi-coauthor-off` | Elimina o hook de pi-coauthor do repositorio actual. |

O hook actívase automaticamente no seguinte commit — non require ningunha acción adicional.

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
.gitignore
README.md
```

---

## Notas de desenvolvemento

- Os tipos da extensión veñen de `@earendil-works/pi-coding-agent`.
- Instalación/eliminación usa o evento `session_start` e dous manexadores `registerCommand`
  (`pi-coauthor`, `pi-coauthor-off`).
- `ctx.hasUI` alterna entre notificacións interactivas (`ctx.ui.notify`) e saída por consola.

## Licenza

MIT.
