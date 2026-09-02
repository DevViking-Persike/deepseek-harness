# Regra 11 — Fonte de paridade externa (repo read-only)

> **Regra opcional/exótica** — só se aplica a projetos que portam features de um repo externo como referência de comportamento. Se o projeto não tem um repo-fonte, ignore esta regra.
>
> **3 camadas:** Camada 1 (Princípio) é universal · Camada 2 é **n/a** (princípio, não há preset de stack) · Camada 3 traz um exemplo abstrato. Veja `_layer-guide.md`.

## Camada 1 — Princípio universal

Quando o projeto porta funcionalidades de outro app/repo existente, há **duas coisas distintas** que não devem ser confundidas:

1. **Fonte de paridade (read-only)** — repo externo consultado **só para entender comportamento/UX** ao implementar features. **Não é dependência de build.**
2. **Dependência de build** — se alguma capacidade do repo-fonte é necessária em compile-time, ela é **vendorizada** (cópia versionada dentro do repo) ou publicada como pacote versionado. O projeto compila em qualquer máquina **sem precisar do repo externo**.

> **Regra de ouro:** o caminho do repo-fonte é referência para humanos, não gargalo de build.

### Como usar ao implementar paridade
1. Ler o componente/tela do repo-fonte **só para entender o comportamento** — **NÃO copiar código nem cores**. Adaptar para a stack do projeto (framework reativo, tokens semânticos de design).
2. Para nova capacidade no motor/domínio: confirmar no repo-fonte (ou na cópia vendorizada) se a capacidade existe, depois espelhar o padrão dos adapters/cases já existentes no projeto, cobrindo os match arms / branches exaustivos.
3. **Respeitar contratos imutáveis:** nome/forma serde dos comandos/ACTIONS do projeto não mudam por causa da paridade; tipos que casam dos dois lados (ex.: enum de "tipo de conexão" no TS e no backend) precisam continuar casando.

### Drift (sincronização da cópia vendorizada)
Ao precisar de uma capacidade nova da parte vendorizada do repo-fonte:
- Copie a mudança do upstream para a cópia vendorizada num **commit separado** (`chore: sync <lib> vendorizada`).
- **Não** portar patches/overrides do workspace do repo-fonte que não são usados pelo projeto.

### Exceções aceitas
- Projeto sem repo-fonte de paridade: regra inteira **não se aplica**.
- Repo-fonte só disponível na máquina do autor (path local): o build não pode depender disso; declarar o path como referência e manter a cópia vendorizada como fonte de build.

## Camada 2 — Preset por stack

**n/a — princípio, não há preset por stack.** A distinção "fonte de paridade vs dependência de build" é independente de linguagem/framework.

## Camada 3 — Exemplo concreto (abstrato)

Cenário: projeto `Acme` porta recursos de gerenciamento do app externo `FooMgr`.

```
# Fonte de paridade (read-only, só na máquina do autor; não bloqueia build)
<Volumes/Dev/foomgr>            # repo externo, UI em Vue 3
└── apps/desktop/src/components/connection/   # referência de UX

# Dependência de build (vendorizada no repo do Acme; é o que o build usa)
<root-do-projeto>/vendor/foomgr-core/         # cópia versionada
└── src/db/<driver>.rs                        # motor real
```

**Fluxo ao portar uma tela de conexão:**
1. Ler `foomgr/.../connection/ConnectionForm.vue` para entender o comportamento (validações, fluxo de save, feedback de erro).
2. Implementar em `Acme` com o framework do projeto (ex.: Svelte 5 runes + tokens semânticos), **sem copiar código nem cores**.
3. Se precisar de um driver novo: confirmar em `foomgr-core/src/db/` que existe, copiar para `vendor/foomgr-core/` num commit `chore: sync`, e espelhar o adapter no projeto.

**Mapa de gap:** a matriz "tela-portada/deferida/skipada" (repo-fonte → projeto) deve viver em `<preencher: .spec/sprints/<sprint>/gap-matrix.md>` ou doc equivalente — não nesta regra.

## Como verificar

```bash
# O build NÃO referencia o path externo (só a cópia vendorizada)?
<preencher: grep do path externo em manifests de build (Cargo.toml/package.json/go.mod/pom.xml/etc.)>   # deve vir vazio

# A cópia vendorizada existe e é referenciada?
<preencher: ls/grep do path vendorizado>
```
Se o build referencia o path externo, é **violação** — vendorizar ou publicar como pacote. Violação exige justificativa no commit/PR.
