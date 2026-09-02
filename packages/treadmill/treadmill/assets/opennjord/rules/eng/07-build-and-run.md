# Regra 7 — Build e execução do desktop app

Em Tauri **não há mais wrapper shell** como no `njord-cli`. A aplicação é uma janela GUI nativa; ações que precisam disparar processos externos (editor, terminal, docker) usam `tauri::api::process::Command` ou plugins Tauri direto do backend Rust.

## Modos de execução

### Desenvolvimento
```bash
npm install                # primeira vez ou após alterar deps
npm run tauri dev          # abre janela com hot-reload do frontend
```

`npm run tauri dev` recompila o backend Rust em modo debug e serve o frontend SvelteKit pelo Vite. Reinicia automaticamente em mudanças.

### Release / distribuição
```bash
npm run tauri build        # gera .AppImage, .deb, .rpm em src-tauri/target/release/bundle/
```

Artefatos ficam em:
- `src-tauri/target/release/bundle/appimage/*.AppImage`
- `src-tauri/target/release/bundle/deb/*.deb`
- `src-tauri/target/release/bundle/rpm/*.rpm`

O binário cru (sem bundle) fica em `src-tauri/target/release/njord-tauri`.

## Implicações

- **Não copiamos para `~/.local/bin/`.** Em Linux, o usuário instala o `.deb`/`.rpm`/`.AppImage` gerado pelo `tauri build`, e a entrada do app fica no menu do sistema.
- Para iterar rápido durante desenvolvimento, `npm run tauri dev` é o caminho — não precisa rebuildar o bundle.
- Não existe função shell que faz `eval` do output do binário. Disparo de comandos externos (ex.: abrir editor) é feito do **backend Rust** via `tauri::api::process::Command` ou plugin `tauri-plugin-shell`.

## Quando NÃO precisa rebuildar
- Mudanças só no frontend (`src/`): hot-reload do Vite cobre.
- Mudanças em comentários, docs, regras: não recompila nada.
- Rodar testes: `cargo test` e `npm run test` não precisam de build do bundle.

## Como detectar problema
Sintoma típico: "a feature nova não aparece na janela" mesmo após edição.

Verificação rápida:
```bash
# `npm run tauri dev` está rodando? (deve estar)
pgrep -af 'tauri dev'

# Build do release está atualizado?
ls -la src-tauri/target/release/njord-tauri 2>/dev/null
```

Se a sessão de `tauri dev` morreu silenciosamente, reiniciar. Se a release está velha e o usuário precisa testar instalada, rodar `npm run tauri build` de novo.
