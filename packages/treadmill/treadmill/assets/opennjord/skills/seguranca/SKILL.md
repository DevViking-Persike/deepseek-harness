---
name: seguranca
description: >-
  Roda o gate de Segurança da esteira (disciplina 40) — confere cobertura e
  severidade dos vetores executados pela exploração dinâmica (`/redteam`)
  contra os invariantes de `.claude/rules/seguranca.md`. Use quando o usuário
  pedir "auditoria de segurança", "gate de segurança", "validar antes do
  release", ou "/seguranca". Último portão antes do release.
---

# Skill: seguranca (disciplina 40)

Tenta **quebrar/invadir** o que subiu, como um atacante. Método em
`.spec/sprints/README.md`; invariantes em `.claude/rules/seguranca.md`
quando rodar no Claude Code, ou na regra equivalente do projeto quando rodar no Codex.
Para a **execução ofensiva** (pentest autorizado do próprio local/dev — SQLi, token
exposto, IDOR, bypass…), use a skill **`/redteam`** — este `/seguranca` é o gate.

## Escopo e autorização
- Alvo: ambiente vivo **autorizado** (NÃO produção sem aceite explícito). Sem DoS.
- Gate **só dinâmico**: confere a exploração do `/redteam` no ambiente vivo. A
  análise **estática** do diff é 100% da lane Segurança da 25 — não se sobrepõem.

## Cobertura (o gate confere, não redefine)
O gate **não** redefine cenários próprios — confere se os vetores T1-T10 do
`/redteam` cobriram os invariantes de `.claude/rules/seguranca.md` (token
vazando, authn/authz, sessão, audit, CSP, redirect/SSRF, bypass em produção) e
se a severidade de cada achado está classificada corretamente. Fonte única da
matriz: `.claude/rules/seguranca.md`.

## Gate (DoD)
- [ ] Cenários executados (ou N/A justificado).
- [ ] Achados classificados (Crítico/Alto/Médio/Baixo) + **PoC** + remediação.
- [ ] **0 Crítico/Alto aberto** (ou aceite de risco registrado).
- [ ] Relatório arquivado em `.spec/sprints/sprint-NN-<tema>/seguranca.md`
  **sem segredos colados**. Achados bloqueantes → tasks em `<sprint>/tasks/`
  (template `desenvolvimento/templates/task.md`; volta ao Dev).

**Headless:** contagem **automática** de Crítico/Alto a partir dos achados do
`/redteam`. `0 Crítico/Alto aberto` ⇒ `VERDICT: PASS`; `>0` sem correção nem
aceite ⇒ `awaiting: humano:aceite-risco` (H5) — não é `VERDICT`. **Linha final
grepável:** `VERDICT: PASS` | `VERDICT: FAIL` + upsert no `esteira-state.yaml`.

## Anti-patterns
- ❌ Rodar contra produção/terceiros sem autorização. ❌ DoS como "teste".
- ❌ Colar segredo no relatório. ❌ "Seguro" sem tentar token/authz.
