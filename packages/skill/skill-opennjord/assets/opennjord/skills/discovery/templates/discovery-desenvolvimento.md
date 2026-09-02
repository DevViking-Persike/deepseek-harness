# Discovery NN — <tema> `[DISCOVERY · DESENVOLVIMENTO]`

> Modo desenvolvimento: o **como/escopo**. Gera contexto técnico (base pra
> construir). Critérios verificáveis viram teste no QA. Segurança entra como
> **requisito de 1ª classe** (§7) — captura, não pentest; o gate 40 verifica.
> Artefato canônico: `.spec/discovery/discovery-NN-<tema>.dev.md`.

## 1. Escopo
- **Faz:** <casos de uso principais> · **NÃO faz:** <fora>
- **Menor fatia entregável (vertical slice):** <...> · baseline × aditivo: <...>

## 2. Requisitos funcionais
- Entradas/saídas/regras/estados/erros: <...>
- Atores e autorização (quem pode o quê): <...>

## 3. NFR — top 3–5 atributos de qualidade (com número)
> Segurança saiu daqui — é bloco de 1ª classe (§7).

| Atributo | Alvo mensurável |
|---|---|
| Performance/escala | <X req/s, p95 < Y ms, N usuários, volume de dados> |
| Disponibilidade | <SLO %, comportamento em falha, recuperação> |
| Manutenibilidade | <testabilidade, observabilidade, quem mantém> |
| Compatibilidade/portabilidade | <plataformas, navegadores, integrações> |
| <outro> | <...> |

## 4. Restrições
- Stack/arquitetura obrigatória/existente: <...> · Legado a respeitar: <...>
- Integrações de terceiros (limites/custos/SLA/rate limit): <...>
- Prazo / equipe / orçamento / legal: <...>

## 5. Premissas & riscos
- **Premissas** (a que, se falsa, derruba o plano): <...>
- **Riscos** (técnico / compliance — retrofit ~3× / dependência): <...>
- **Spikes** necessários (provar viabilidade antes): <...>

## 6. Achados de subagents (se usados)
- **Subagents criados:** <código/legado, NFR/riscos, docs/operabilidade, outro>
- **Evidências úteis:** <fatos observados, com caminho/linha quando houver>
- **Lacunas para usuário:** <perguntas ainda abertas>
- **Hipóteses não confirmadas:** <não tratar como verdade>

## 7. Dependências & aceitação
- **Depende de:** <sistemas/serviços/equipes>
- **Critérios de aceitação (verificáveis):**
  1. **Dado** <contexto> **quando** <ação> **então** <resultado observável>.

## 8. Requisitos de Segurança (1ª classe)
> Cada resposta **instancia** um invariante de `rules/seguranca.md` para este
> incremento e vira **AC que o gate 40 (seguranca/redteam) verifica na execução**.
> O discovery **captura**, não pentesta.

| Dimensão (→ rule) | Requisito instanciado neste incremento | AC verificável (gate 40) |
|---|---|---|
| Superfície de ameaça | <endpoints/entradas expostas, atores hostis> | <...> |
| Dado sensível (§Dados) | <o que é sensível, classificação, o que não logar> | <...> |
| Authn/Authz (§Auth) | <como autentica; authz por papel deny-by-default> | <...> |
| Tenancy/isolamento | <multi-tenant? fronteira de isolamento> | <...> |
| Auditoria/log (§Dados) | <o que audita, append-only, actor do usuário autenticado> | <...> |
| LGPD/compliance | <bases legais, consentimento, minimização> | <...> |
| Manejo de segredos (§Segredos) | <onde vivem, nunca no cliente/git/log> | <...> |

## 9. Apresentação de dados & superfície UX
- **Tipo de apresentação:** <dashboard / grid / relatório / API / realtime>
- **Volume & paginação:** <quantos itens, paginação/scroll, filtros/ordenação>
- **Acessibilidade / i18n:** <requisitos a11y, idiomas, formatos regionais>

## 10. Direção arquitetural
- **Decisões/restrições técnicas de alta relevância a fechar ANTES do dev:** <...>
- **Alternativas descartadas & porquê:** <...>
- **O que alimenta o gate 10 (design):** <ponto que a Arquitetura precisa ratificar>

## Definition of Ready (DoD da Discovery dev)
- [ ] Escopo (faz × não faz × slice) · [ ] requisitos funcionais
- [ ] NFR top 3–5 **com número** · [ ] restrições/premissas/riscos mapeados
- [ ] dependências · [ ] critérios de aceitação verificáveis
- [ ] **Segurança** (§8) instanciada por invariante de `rules/seguranca.md` → AC pro gate 40
- [ ] apresentação de dados/UX (§9) · [ ] direção arquitetural (§10) → gate 10
