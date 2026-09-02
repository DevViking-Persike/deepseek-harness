# Regra 7 — Build & Run do projeto

> **3 camadas:** Camada 1 (Princípio) é universal e obrigatória · Camada 2 (Preset por stack) mostra o comando concreto da stack do projeto · Camada 3 traz um exemplo · `Como verificar` fecha. Veja `_layer-guide.md`.

## Camada 1 — Princípio universal

O projeto tem **dois modos de execução**: desenvolvimento (hot-reload, iteração rápida) e release/distribuição (artefato empacotado). O agente deve saber qual disparar em cada situação e **onde** os artefatos são gerados.

### Modos
- **Desenvolvimento** — recompila/servir em mudanças, abre a janela/terminal/browser. É o caminho padrão para iterar. Não rebuilda o artefato de distribuição.
- **Release / distribuição** — gera o artefato instalável (binário, bundle, imagem, wheel, apk). Mais lento; use só para validar distribuição ou gerar deliverable.

### Quando NÃO precisa rebuildar
- Mudança só em docs/comentários/regras: nada recompila.
- Mudança só no frontend: hot-reload cobre (não rebuilda backend).
- Rodar testes unitários: não depende do build de distribuição.

### Disparo de processos externos
Apps empacotados (desktop/mobile) **não usam wrapper shell** nem `eval` do output do binário. Disparar editor/terminal/docker a partir do app é feito pela **API de processo do framework** (ex.: plugin de shell), a partir do backend nativo — nunca via shell wrapper.

### Exceções aceitas
- Ferramentas CLI puras (sem janela) podem ter um wrapper shell de conveniência — declarar explicitamente no commit.
- CLIs instaladas via `cargo install`/`go install`/`pipx` vão para PATH; são exceção ao "não copiar para PATH" abaixo.

## Camada 2 — Preset por stack

> Veja `stacks/`. Comandos reais da stack ativa. Pule as stacks não usadas pelo projeto.

### Rust · Tauri (desktop GUI)
```bash
npm install                # primeira vez ou após alterar deps
npm run tauri dev          # desenvolvimento: abre janela com hot-reload
npm run tauri build        # release: gera bundle em <preencher: dir de bundle>
```
Artefatos: `<preencher: target/release/bundle/>` (`.AppImage`/`.deb`/`.rpm`/`.dmg`/`.msi` conforme SO). Binário cru: `<preencher: target/release/<bin>>`. **Não copiar para `~/.local/bin/`** — o usuário instala o bundle; a entrada fica no menu do sistema.

### Node · TypeScript (frontend puro ou fullstack)
```bash
npm install                # ou pnpm install / yarn
npm run dev                # desenvolvimento: Vite/Next/Node com hot-reload
npm run build              # release: output em <preencher: dist/> ou .next/
```
Artefatos: `<preencher: dist/>` (Vite/SvelteKit) ou `.next/` (Next) ou bundle Node. Servir via `npm run preview` ou host estático.

### Go
```bash
go run ./cmd/app           # desenvolvimento: compila+roda direto
go build -o bin/app ./cmd/app   # release: binário em bin/
# serviço com hot-reload: air (ferramenta) ou entr
```
Artefatos: binário estático único em `<preencher: bin/>`. Cross-compile via `GOOS/GOARCH`.

### C# (.NET)
```bash
dotnet run --project src/App   # desenvolvimento
dotnet build -c Release        # release
dotnet publish -c Release -o publish/   # distribuição
```
Artefatos: `<preencher: publish/>` (binário + deps) ou pacote NuGet.

### Python
```bash
uv run python -m app          # desenvolvimento (uv) — ou: python -m app
uv build                      # release: wheel + sdist em dist/
# empacotamento desktop: pyinstaller --onefile src/main.py
```
Artefatos: `<preencher: dist/>` (`.whl`/`.tar.gz`) ou binário PyInstaller.

### KMP (Kotlin Multiplatform · mobile/desktop)
```bash
./gradlew :app:assembleDebug          # Android debug
./gradlew :app:run                    # desktop (JVM)
./gradlew :app:assembleRelease        # release
```
Artefatos: `<preencher: app/build/outputs/>` (`.apk`/`.aab` para Android; `.app`/`.dmg` para macOS desktop).

## Camada 3 — Exemplo concreto

Cenário (Rust · Tauri): usuário reporta "a feature nova não aparece na janela".

```bash
# 1. O dev server está vivo?
pgrep -af 'tauri dev'           # se vazio, reiniciar: npm run tauri dev

# 2. Release velha e usuário quer testar instalado?
npm run tauri build
ls -la <preencher: dir de bundle>/   # confirmar que o bundle regenerou (ex.: target/release/bundle/)
```
Se o `tauri dev` morreu silenciosamente, reiniciá-lo resolve; se a release está velha, rebuildar.

## Como verificar

```bash
# Sessão de desenvolvimento ativa?
<preencher: pgrep -af '<dev cmd>'>

# Artefato de release atualizado?
<preencher: ls -la <dir de artefato>>
```
Violação exige justificativa no commit/PR (ex.: manteve wrapper shell legado por motivo de compatibilidade).
