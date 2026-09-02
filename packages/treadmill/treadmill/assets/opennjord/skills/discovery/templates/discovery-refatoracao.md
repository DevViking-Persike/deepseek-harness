# Discovery NN — <tema> `[DISCOVERY · REFATORAÇÃO]`

> Modo refatoração: melhorar um **sistema existente** — design, código, bugs,
> performance — sem regredir comportamento. Critérios de não-regressão viram
> teste no QA. Leitura de código via subagents read-only (sob demanda).
> Artefato canônico: `.spec/discovery/discovery-NN-<tema>.refatoracao.md`.

## 1. Alvo & motivação
- **O que motiva:** <smell / bug / perf / débito técnico>
- **Por que agora:** <gatilho, custo de não fazer, janela>
- **Sintoma observável:** <como a dor se manifesta hoje>

## 2. Estado atual / inventário
> Use subagents read-only (§Subagents do SKILL) para mapear; sob demanda em
> incrementos pequenos. Nenhuma edição, nenhum comando destrutivo.

- **Módulos/arquivos afetados:** <caminhos, com linha quando útil>
- **Fluxos impactados:** <ponta-a-ponta do que muda>
- **Testes que cobrem hoje:** <arquivos de teste, cobertura observada>

## 3. Não-regressão (comportamento a preservar)
- **Comportamento que NÃO pode mudar:** <contratos, saídas, efeitos observáveis>
- **Caracterização existente:** <testes que fixam o comportamento atual>
- **Lacuna de caracterização:** <o que precisa de teste antes de mexer>

## 4. Bugs (se houver)
- **Repro:** <passos determinísticos que reproduzem>
- **Hipótese de causa-raiz:** <onde/porquê — a confirmar>
- **Comportamento correto esperado (vira AC):** <...>

## 5. Performance (se aplicável)
- **Baseline atual:** <métrica medida hoje: latência/throughput/memória>
- **Alvo:** <número mensurável a atingir>
- **Hotspots suspeitos:** <onde> · **Como medir/profiling:** <ferramenta/método>

## 6. Design / código
- **Acoplamento / violação de camada:** <onde>
- **Complexidade a reduzir:** <arquivo/função, tamanho, aninhamento>
- **Design-alvo:** <estrutura pretendida depois da refatoração>

## 7. Raio de impacto & escopo
- **O que NÃO tocar:** <fronteira intocável>
- **Fatiamento incremental:** <como quebrar em passos seguros e reversíveis>
- **Ordem sugerida:** <sequência dos passos>

## 8. Achados de subagents (se usados)
- **Subagents criados:** <código/legado, perf/profiling, riscos, outro>
- **Evidências úteis:** <fatos observados, com caminho/linha quando houver>
- **Lacunas para usuário:** <perguntas ainda abertas>
- **Hipóteses não confirmadas:** <não tratar como verdade>

## Aceitação verificável (Given/When/Then)
- **Não-regressão:**
  1. **Dado** <fluxo preservado> **quando** <ação> **então** <mesmo resultado de antes>.
- **Bugfix (se houver):**
  2. **Dado** <repro do bug> **quando** <ação> **então** <comportamento correto>.
- **Performance (se houver):**
  3. **Dado** <carga> **quando** <medido> **então** <métrica ≤ alvo>.

## DoD da Discovery (refatoração)
- [ ] Alvo/motivação claros · [ ] inventário do estado atual
- [ ] não-regressão definida **com caracterização** (ou lacuna marcada)
- [ ] bug com repro + causa-raiz hipotética (se houver)
- [ ] baseline + alvo de performance (se houver) · [ ] design-alvo
- [ ] raio de impacto (o que NÃO tocar) + fatiamento incremental
- [ ] aceitação verificável (não-regressão + bugfix + perf)
