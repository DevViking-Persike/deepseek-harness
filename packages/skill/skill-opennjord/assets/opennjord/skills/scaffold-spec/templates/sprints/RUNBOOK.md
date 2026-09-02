# RUNBOOK — Esteira de PROCESSO (.spec/) rodada autonomamente

> **Duas esteiras, não confunda (GAP-I):** ESTE é o RUNBOOK da esteira de
> **PROCESSO** — move o produto pelas disciplinas 00→40 por sprint, dirigido pelo
> cursor `.spec/esteira-state.yaml`. A esteira de **QUALIDADE de código** (stages
> `Q00-check…Q30-review`) é outra: vive em `.opennjord/esteira/RUNBOOK.md` e valida
> a saúde de um diff. Um `/loop` que abre "o RUNBOOK" precisa saber qual é qual.

## Fonte de estado (precedência)

- **Cursor — fonte ÚNICA de decisão do tick:** `.spec/esteira-state.yaml`.
- **Diário humano (append):** `.spec/STATE.md` — espelho narrativo, não decide.
- **Espelhos write-only:** `✅` no `plano-de-sprints-NN.md`, `Status:` nas tasks.
  O tick ESCREVE neles; **nunca decide por eles**. Reconciliação `plano/task →
  yaml` só no **bootstrap** (yaml ausente). Depois disso, o yaml vence.

## Contrato do tick

```
1. LÊ .spec/esteira-state.yaml
     ausente ⇒ BOOTSTRAP: valida .spec, deriva sprint_ativa/etapa do plano.
                sem plano-de-sprints ainda ⇒ etapa: 00-discovery.
2. SE awaiting != null ⇒ verifica liberação (humano limpou o campo / ambiente
     subiu). Não liberado ⇒ PARK: pinga e encerra o tick. Liberado ⇒ limpa
     awaiting e segue.
3. DECIDE por LOOKUP (cursor + ordem canônica abaixo). Guardas de idempotência,
     lendo SÓ o yaml (nunca a prosa):
       veredito: PASS da etapa            ⇒ avança etapa;
       sprint_ativa com | NN ✅ | no plano ⇒ avança sprint_ativa;
       task com Status: entregue           ⇒ pula essa task (dev).
4. EXECUTA UMA etapa (ou UMA fatia: 1 task do dev) em modo não-interativo.
5. TRADUZ o veredito da skill p/ PASS|FAIL:
       FAIL ⇒ tentativa += 1; tentativa == 2 ⇒ awaiting: humano:<etapa>-2x.
6. UPSERT do yaml (etapa/tentativa/awaiting/veredito/atualizado)
     + 1 linha no STATE.md
     + marca os espelhos que fecha (Status: da task, | NN ✅ | do plano).
7. ENCERRA o tick. Terminais: GO (avançou) | PARK(awaiting)
     | DONE(sprint→próxima) | DONE(backlog vazio).
```

## Ordem canônica (por sprint)

```
00s → 10a → 20 → 25 → 10b → 30-qa-rpa → 30-qa
→ 40-redteam → 40-seguranca → deploy
```

- **`00s` abre o sprint** e é o **dono do `mkdir .spec/sprints/sprint-NN-<tema>/`**.
  O `NN` é alocado lendo a **próxima linha SEM `✅`** do `plano-de-sprints-NN.md`.
- **`00s` NUNCA dá VERDICT** — avança por **EXISTÊNCIA** de `discovery-sprint.md`.
  Quem reprova contexto não-aterrado é o `10a` (o 00s não é gate).
- Par **executor→gate**: `25`→`10b`, `30-qa-rpa`→`30-qa`,
  `40-redteam`→`40-seguranca`. Cada id ocupa **seu próprio tick**: o gate só
  roda no tick seguinte ao do seu executor — nunca os dois no mesmo tick.
- **Fechamento do sprint:** o tick marca `| NN ✅ |` no plano, zera `sprint_ativa`
  e destrava quem dependia dele.

## Paradas humanas (awaiting)

| Gate | awaiting |
|---|---|
| H0 scaffold-mode ausente | `humano:scaffold-mode` |
| H1 Plano de Sprints aprovado | `humano:plano` (abre o loop) |
| H2 10a design (veredito autoral) | `humano:10a` |
| H3 dev não convergiu (max-rounds) | `humano:dev-convergencia` |
| H4 aplicar correções da 25 | no `/loop` os achados FAIL viram tasks; edição direta só FORA do loop |
| H5 aceite de risco no 40 | `humano:aceite-risco` |
| H6 deploy produção | `humano:deploy-prod` |
| gate reprovado 2× | `humano:<etapa>-2x` |
| ambiente indisponível (qa/seg) | `ambiente:qa` / `ambiente:seg` |

## Auto-commit no modo `/loop`

- Permitido auto-commitar **SÓ paths de estado/evidência**: `.spec/**` e
  `.spec/sprints/sprint-NN-<tema>/**` (cursor, STATE, discovery-sprint, tasks,
  relatórios de review/qa/seguranca). Mensagem:
  `chore(esteira): tick sprint-NN <etapa> <veredito>`.
- **NUNCA** commit de **código** sem passar por gate. O diff de código fecha junto
  da task pelo próprio `/desenvolvimento` (1 task = 1 commit), sob os gates
  25/10b/30/40 — não pelo tick de estado.

## Comandos reais por etapa

Os comandos concretos (build/lint/test/RPA, subir `dev_server`, alvo do redteam)
vivem no `.spec/MANIFEST.md` (*Maquinário de validação* + campos `dev_server` e
`redteam_target`). O tick consulta o MANIFEST antes de executar cada etapa.
