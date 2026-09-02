---
name: qa-rpa
description: >-
  Cria e roda RPAs de validação de QA com Playwright, navegando como usuário real
  para validar front, back, fluxo, console, status HTTP e vazamento de token.
  Gera matriz PASS/FAIL por tela. Use quando o usuário pedir "criar RPA de QA",
  "automação de testes", "validar todas as telas", "testar o fluxo front+back",
  "RPA de validação", ou "/qa-rpa". É o executor da disciplina 30 (QA).
---

# Skill: qa-rpa — RPA de validação (front + back)

Constrói o **harness de RPA** que prova que cada tela **funciona de verdade** —
navegando como o usuário real, não só com `fetch`. Generaliza o padrão validado
(padrão de RPA por sprint validado em produção). Disciplina 30 → `/qa` é o gate;
esta skill é a **execução automatizada**.

## Definition of Ready (ambiente vivo)
Sobe o ambiente pelo comando **`dev_server`** do `.spec/MANIFEST.md` (é o alvo do
`WC_HOST`). Ambiente **indisponível** (porta não responde / comando ausente) ⇒
`awaiting: ambiente:qa` no cursor — **não** rode a matriz contra um alvo morto.

## Por que navegador real (não só fetch)
O navegador reusa conexão e **renderiza** a resposta — pega classes de erro que o
`fetch` não vê (ex.: 502 "too big header", erro de hidratação, console error,
token vazando no `window.__data`). A RPA captura o **status HTTP do documento**,
erros de console, e tira screenshot.

## O que cada RPA valida, por tela
1. **Front:** a rota responde 200/3xx (sem 404/500); a tela renderiza seu **marcador**
   (texto/elemento esperado); **0 erro de console**; navegação (sidebar/links) funciona.
2. **Back:** a **BFF/endpoint** por trás da tela responde o **envelope esperado**
   (`{data,error,meta}` ou o do projeto), com paginação/erro tipado; **0 token/JWT**
   no PageData/HTML/bundle (anti-vazamento).
3. **Fluxo:** para telas com ação (form, upload, submit), executar o fluxo e asseverar
   o efeito (registro criado, redirect correto, toast).
4. **RBAC:** rodar a matriz por **perfil** — cada papel vê só o que deve (403 onde não deve).

## Como montar (passos)
1. **Levantar a MATRIZ ESTENDIDA** (contrato que o gate `/qa` auto-ratifica): para
   cada rota de cada front, `{ path, perfilMin, marcador, endpointBack, acao? }`, e
   além disso, obrigatoriamente:
   - **cada AC do sprint → 1 linha** da matriz (mapa AC→linha explícito);
   - **1 linha de AuthZ por papel** (cada perfil vê só o que deve; 403 onde não deve);
   - **≥1 caminho de erro por endpoint** (input inválido → 4xx tipado).
   Cobrir **todas as etapas** de cada tela (índice + detalhe + ação). **Matriz
   incompleta** (AC sem linha, papel sem AuthZ, endpoint sem erro) ⇒ o gate `/qa`
   dá `VERDICT: FAIL` — não auto-ratifica.
2. **Harness:** copie os templates desta skill e adapte:
   - `templates/lib-comum.mjs` — `HOST`, login real (ou bypass dev), helpers.
   - `templates/rpa-telas.mjs` — itera a matriz: navega, captura status do documento,
     console, marcador, screenshot; depois bate no `endpointBack` e checa envelope + 0 token.
3. **Rodar** contra o ambiente alvo (`WC_HOST=https://<host>`); por perfil.
4. **Relatório PASS/FAIL** por tela (Markdown), arquivado em `.spec/qa/sprint-NN-<tema>/`.
   FAIL bloqueia o gate da QA → volta ao Dev.

## Critérios de uma RPA boa (DoD)
- [ ] **Toda rota** de **todo front** coberta (índice + detalhe + ação).
- [ ] Por tela: status do documento OK + marcador visível + 0 console error.
- [ ] Back: envelope correto + **0 token** no client (PageData/HTML/bundle).
- [ ] Fluxos com ação asseveram o **efeito** (não só 200).
- [ ] RBAC por perfil (403 onde deve).
- [ ] Relatório PASS/FAIL arquivado; PASS = entrada confiável p/ release.

## Anti-patterns
- ❌ Validar só com `fetch` (perde erro de render/hidratação/header).
- ❌ Asseverar só status 200 sem conferir o **marcador** (página de erro também dá 200).
- ❌ Não checar vazamento de token no client.
- ❌ RPA que passa com bug (falso negativo) — cada checagem precisa poder **falhar**.

> Ferramenta: Playwright/Chromium. Se o projeto não tiver, instale no harness
> (`pnpm add -D @playwright/test && npx playwright install chromium`).
