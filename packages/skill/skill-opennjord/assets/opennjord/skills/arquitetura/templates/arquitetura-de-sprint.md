# Arquitetura NN — <tema> `[ARQUITETURA · DESIGN]`

> Saída do design gate (10a). Transforma o `discovery-sprint.md` (QUÊ) na
> SPEC-implementável (COMO). Artefato canônico:
> `.spec/arquitetura/arquitetura-NN-<tema>.md`. O Dev (20) só começa com
> `VERDICT: PASS`. Reprovou 2× → parada humana.

## 0. Entrada
- **Discovery-sprint:** `.spec/sprints/sprint-NN-<tema>/discovery-sprint.md`
- **Discoveries-fonte:** <preencher: artefatos `.spec/discovery/` consumidos>
- **Base git:** <preencher: branch + SHA em que as evidências valem>
- **Regras/ADRs aplicáveis:** <preencher: links, não transcrição>

## 1. Levantamento de lacunas por área (Fase 1)
| Área | Estado | Evidência/lacuna |
|---|---|---|
| Database | <verde\|não aplicável\|resolúvel por código\|irredutível> | <path:linha ou lacuna> |
| Backend | <verde\|não aplicável\|resolúvel por código\|irredutível> | <path:linha ou lacuna> |
| Frontend | <verde\|não aplicável\|resolúvel por código\|irredutível> | <path:linha ou lacuna> |
| Security | <verde\|não aplicável\|resolúvel por código\|irredutível> | <path:linha ou lacuna> |

## 2. Achados de subagents (Fase 2 — somente lanes disparadas)
> Separar fatos observados de premissas. Evidências usam `path:linha`.

### Database
- **Fatos/evidências:** <preencher ou não disparado>
- **Premissas/riscos:** <preencher ou —>
- **Lacunas restantes:** <preencher ou —>

### Backend
- **Fatos/evidências:** <preencher ou não disparado>
- **Premissas/riscos:** <preencher ou —>
- **Lacunas restantes:** <preencher ou —>

### Frontend
- **Fatos/evidências:** <preencher ou não disparado>
- **Premissas/riscos:** <preencher ou —>
- **Lacunas restantes:** <preencher ou —>

### Security
- **Fatos/evidências:** <preencher ou não disparado>
- **Premissas/riscos:** <preencher ou —>
- **Lacunas restantes:** <preencher ou —>

## 3. Decisões de Negócio/Arquitetura (`## DN` — Fase 3)
> Cada DN registra atual × alvo, alternativas e trade-offs. Exigir ≥3 DN quando
> o modo for Refatoração ou o foco for Arquitetura.

### DN1 — <título>
- **Atual:** <preencher>
- **Alvo:** <preencher>
- **Alternativas:** <preencher>
- **Trade-offs:** <preencher>
- **Decisão:** <preencher>
- **ADR:** <`.spec/reference/ADR-NNN` ou não aplicável>
- **Diagrama:** <`.spec/reference/diagrams/<tipo>-NN-<tema>/` ou não aplicável>
- **Evidências do diagrama:** <paths:linhas que sustentam nós e relações>

## 4. SPEC-implementável (Fase 4 — Spec Enricher)
- [ ] Toda task do §7 do `discovery-sprint.md` tem AC verificável e decisão de design associada.
- [ ] Escopo técnico de escrita e dependências estão delimitados.
- [ ] Toda dependência cross-módulo tem contrato definido.
- [ ] Toda decisão estrutural tem ADR quando aplicável.
- [ ] Database, Backend, Frontend e Security estão cobertos ou marcados como não aplicáveis com justificativa.
- [ ] Nenhuma lacuna bloqueante ficou sem dono.
- [ ] Nenhuma lacuna irredutível está aberta; se estiver, o cursor usa `awaiting: humano:10a` e o gate não dá PASS.

## 5. Camadas, contratos, invariantes e ADRs
- **Camadas/direção de dependência:** <preencher>
- **Contratos/API/eventos:** <preencher>
- **Modelo/migrações:** <preencher ou não aplicável>
- **Estado/apresentação:** <preencher ou não aplicável>
- **Invariantes de segurança:** <preencher>
- **Estratégia de testes:** <preencher>

## 6. Lacunas e correções antes do Dev
| Lacuna | Tipo (QUÊ/COMO/viabilidade) | Dono | Próxima ação |
|---|---|---|---|
| <preencher ou —> | <preencher> | <preencher> | <voltar ao 00s\|corrigir design\|spike timeboxado\|decisão humana> |

---

> **Headless:** se faltar decisão humana, registrar `awaiting: humano:10a` no
> cursor e não inventar `PASS`. O tick lê somente o campo `awaiting` ou a linha
> final abaixo quando o gate concluir.
>
> Substituir o marcador somente ao concluir o gate.
VERDICT: <PASS|FAIL>
