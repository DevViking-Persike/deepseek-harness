---
name: tick-esteira
description: Executa UM tick da esteira de PROCESSO (.spec) dirigido pelo cursor esteira-state.yaml — pensado pro /loop
---

Execute **UM tick** da esteira de PROCESSO deste repo. Contrato completo em
`.spec/sprints/RUNBOOK.md`; comandos concretos por etapa no
`.spec/MANIFEST.md` (seção *Maquinário de validação*: `dev_server`,
`redteam_target`, `deploy: skip`).

1. Leia `.spec/esteira-state.yaml` — **fonte ÚNICA de decisão**; NUNCA decida
   por prosa do `STATE.md` ou por marcas `✅` (são espelhos write-only).
2. Se `awaiting != null`, verifique liberação (humano limpou o campo /
   ambiente subiu); não liberado ⇒ **PARK**: reporte 1 linha e encerre o tick.
   Liberado ⇒ limpe `awaiting` e siga.
3. Decida por **lookup** contra a ordem canônica literal do RUNBOOK:
   `00-discovery → plano → [00s → 10a → 20 → 25 → 10b → 30-qa-rpa → 30-qa →
   40-redteam → 40-seguranca] → deploy → done`. Cada executor e gate ocupa seu
   próprio tick; aliases agrupados não são ids válidos. Aplique as guardas de
   idempotência do `.spec/sprints/RUNBOOK.md` lendo SÓ o yaml.
   **Regra de transição pré-plano:** `etapa: 00-discovery` + `awaiting: null`
   + plano com linha sem `✅` ⇒ tratar como `00s` (abrir a sprint: `mkdir
   .spec/sprints/sprint-NN-<tema>/` + `/discovery sprint NN` + criar o
   `README.md` mínimo da sprint (spec-check exige — lição da 38-01), com `NN` = a
   próxima linha sem `✅` do plano).
4. Execute **UMA etapa** (ou 1 task do dev) via a skill correspondente
   (`/discovery`, `/arquitetura design|review`, `/desenvolvimento`,
   `/review-codigo-subagents`, `/qa-rpa`, `/qa`, `/redteam`, `/seguranca`),
   consultando o Maquinário de validação do `.spec/MANIFEST.md`
   (`dev_server`/`redteam_target`). Etapa `deploy` ⇒ `done` direto
   (MANIFEST declara skip — app desktop, sem produção).
5. Traduza o veredito pra `PASS|FAIL`; FAIL ⇒ `tentativa += 1`; 2ª reprovação
   ⇒ `awaiting: humano:<etapa>-2x`. Paradas transversais do RUNBOOK valem
   sempre (produção/terceiro, destrutivo em dados reais, decisão estrutural
   sem registro, segredo real em teste).
6. Upsert do yaml + 1 linha no `STATE.md` + espelhos (`Status:` da task,
   `✅` do plano). **Auto-commit SÓ de paths `.spec/**`, SEMPRE com `git add` de caminhos EXPLÍCITOS (nunca `git add` de diretório — risco de varrer untracked de outra rodada)**, mensagem
   `chore(esteira): tick sprint-NN <etapa> <veredito>`; **NUNCA commite
   código** — diff de código fecha pelo `/desenvolvimento` (1 task = 1
   commit), sob os gates.
7. Encerre reportando **GO | PARK | DONE**.
