# Esteira de Qualidade de Código

> Pipeline **gated** que garante código limpo, testado e aderente às regras de
> engenharia. Transversal — roda sobre qualquer incremento, independente da
> disciplina do `.spec/` (00 Discovery → 40 Segurança).

## O que é

Diferente da esteira de **processo** do `.spec/` (que move o produto pelas
disciplinas de discovery→dev→qa→segurança), esta é a esteira de **qualidade de
código**: valida que o diff produzido em qualquer etapa é *saudável* — adere às
regras `rules/eng/*`, tem cobertura/mutation adequadas, respeita camadas e bate
com os critérios de aceitação/ADRs. É ortogonal ao `.spec/` e pode ser invocada
ao fim de cada disciplina ou de forma autônoma sobre um diff/branch.

## As 4 etapas (sequenciais, gates bloqueantes)

```
Q00-check → Q10-refactor → Q20-test-cov-mutation → Q30-review
```

| Etapa | O que faz | Gate bloqueante |
|-------|-----------|-----------------|
| **Q00-check** | Auditoria contra `rules/eng/*` (tamanho, SOLID, camadas, simplicidade). Não edita. | 0 violação bloqueante |
| **Q10-refactor** | Aplica Regra 6 (rede de segurança → split → DIP → simplificar → validar). 1 commit = 1 motivo. | Checks verdes + 0 violação restante |
| **Q20-test-cov-mutation** | Garante testes + cobertura ≥84% + mutation ≥84%. Mutation roda junto dos testes. | cov≥84% E mutation≥84% E testes verde |
| **Q30-review** | Review do diff: 0 violação de camada/dependência, lógica na camada certa, bate com ACs/ADR. | 0 violação de camada + diff bate com plano |

Reprovado no gate → **volta uma casa**. Reprovado **2× no mesmo gate** → parar e
pedir humano (ver `gates.md`).

## Regra orchestrator-always (do repo-fonte)

Workers nunca rodam isolados. Quem dispara esta esteira é o **Main Orchestrator**
(ex.: o do `scaffold-spec`), que lê o contexto, propaga naming/ACs e delega
etapa por etapa a sub-orchestrators/workers. Tarefa micro (hotfix de 1 arquivo)
é exceção. Ver `agents/` para templates.

## Composição com skills e tools instaladas

- **`graphify`** (skill) — análise de impacto **opcional** antes/depois do
  refactor e no review: `graphify query "<pergunta>"`, `graphify path "<A>"
  "<B>"`, `graphify explain "<conceito>"`. Retorna subgrafo scoped; útil para
  entender dependências antes do split e validar que o diff não quebrou
  invariantes de camada.
- **`archify`** (skill externa) — no modo `documentar`, comunica/valida diagramas
  autorados: `guide`, `validate`, `preview`, `deliver`, `compare`. Não lê o código;
  é opcional e tem fallback Markdown + Mermaid/ASCII em `.spec/reference/`.
- **`/check-rules`** (command) — implementa a etapa Q00-check (auditoria read-only).
- **`/refactor <arquivo>`** (command) —implementa o fluxo da etapa Q10-refactor num arquivo.
- **`/code-review`** (command) — complementa a etapa Q30-review (bugs + cleanups).
- **Hooks** (`templates/hooks/`) — rodam `spec-check`/checks automaticamente em
  Stop/PostToolUse. **Opt-in** — mesclar no `settings.json`, não auto-aplicar.
- **`tools/spec-check.sh`** — valida a estrutura `.spec/` (não é desta esteira,
  mas roda junto no fechamento).

## Modo self-test

A própria esteira pode **se validar**: ao gerar estes templates, o orchestrator
spawna um sub-orchestrator + workers para:
1. **Grep de agnosticidade/resíduo** — confirmar que nenhum template cita
   particulares do projeto-fonte como prescrição (tokens listados no `_STYLE.md`).
2. **Smoke de instalação** — instalar os templates num diretório temporário e
   rodar `spec-check.sh` + os greps de verificação das regras contra uma amostra.
3. **`check-rules` contra amostra** — rodar a etapa Q00-check sobre o próprio pacote
   gerado (regra 1 ≤300 linhas, links íntegros).

Detalhes operacionais no `RUNBOOK.md` → "Modo self-test".

## Anti-patterns

- Pular o Q00-check e ir direto ao refactor ("já sei o que fazer").
- Rodar mutation separado dos testes (Regra 2: sempre juntos).
- Desabilitar teste (`#[ignore]`, `it.skip`) para passar o gate.
- Refatorar + bugfix no mesmo commit (Regra 6: um commit, um motivo).
- Worker escrevendo fora da sua etapa/diretório designado.
