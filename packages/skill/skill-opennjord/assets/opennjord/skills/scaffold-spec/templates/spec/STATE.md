# Spec State — <preencher: nome do projeto>

> **Fonte de decisão é o cursor `.spec/esteira-state.yaml`.** Este arquivo é o
> diário narrativo humano, **append-only** — contrato em
> `.spec/sprints/RUNBOOK.md`. Nada aqui decide tick; tudo aqui explica.

## Como escrever

- **Append-only:** entrada nova entra no topo do histórico. Não reescreva o
  passado — correção vira entrada nova dizendo o que mudou e por quê.
- Uma entrada por tick concluído, abrindo com a data ISO e a etapa.
- Narrativa curta: o que rodou, o que ficou provado, o que ficou pendente.
- Toda DoD "atualize o STATE" = **upsert no cursor + 1 linha aqui**.

## Incremento ativo

| Campo | Valor |
|---|---|
| Sprint ativa | <preencher: NN-tema (etapa atual)> |
| Última entregue | <preencher: NN-tema (YYYY-MM-DD)> — ou `nenhuma` |
| Backlog | <preencher: plano-de-sprints-NN + status de aprovação> |
| Atualizado em | <preencher: YYYY-MM-DD> |

Progresso narrado em prosa encadeada (sem casa pro `00s` — não é gate):
`✅ 00 Discovery → ✅ 10a Arquitetura → 🟡 20 Dev → ⬜ 25 Review → ⬜ 10b
Arquitetura → ⬜ 30 QA → ⬜ 40 Segurança`

## Histórico (mais recente primeiro)

> **<preencher: YYYY-MM-DD> — BOOTSTRAP (entrada-exemplo, substitua):** `.spec/`
> criado pelo scaffold — MANIFEST, cursor `esteira-state.yaml` (schema 2,
> `etapa: 00-discovery`, `tentativa: 1`), este diário e o RUNBOOK no lugar. O
> preflight do pipeline canônico passa: cursor legível e MANIFEST presente, com
> a etapa `deploy` marcada como skip no MANIFEST. Nenhuma sprint aberta ainda;
> o próximo tick roda a Discovery da rodada e fecha no `plano-de-sprints-01`.
> Nenhum comando destrutivo executado, nenhuma credencial tocada.
