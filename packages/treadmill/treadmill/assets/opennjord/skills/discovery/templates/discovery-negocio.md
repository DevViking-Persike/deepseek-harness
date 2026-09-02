# Discovery NN — <tema> `[DISCOVERY · NEGÓCIO]`

> Modo negócio: o **porquê**. Gera contexto de negócio/produto (base de
> documentação de produto + justificativa de feature + regras do domínio).
> Método: The Mom Test (comportamento/histórias, não opiniões).
> Artefato canônico: `.spec/discovery/discovery-NN-<tema>.negocio.md`.

## 1. Outcome (resultado de negócio)
- **Resultado a mover:** <retenção / ativação / receita / custo / NPS — não a feature>
- **Liga à estratégia:** <North Star / OKR>
- **Métrica + baseline:** <métrica> · hoje = <valor>

## 2. Usuário & contexto
- **Persona/papel:** <quem>
- **Situação/gatilho:** <quando o problema aparece, frequência>

## 3. Oportunidade / problema
- **Dor/necessidade/desejo:** <específico, não a solução>
- **Como resolve hoje (alternativa atual):** <o que faz — da última vez que precisou>
- **O que é mais frustrante / quanto custa:** <tempo/dinheiro/risco>
- **O que já tentaram e por que não resolveu:** <...>

## 4. Jobs to be Done
- Quando **<situação>**, quer **<motivação>**, pra **<resultado>**.

## 5. Os 4 riscos (evidência, não opinião)
| Risco | Pergunta | Evidência / sinal de comportamento |
|---|---|---|
| **Valor** | vai usar/pagar? | <...> |
| **Usabilidade** | consegue usar? | <...> |
| **Viab. técnica** | dá pra construir? | <→ discovery desenvolvimento> |
| **Viab. negócio** | funciona pro negócio (legal/financeiro/operacional)? | <...> |

## 6. Achados de subagents (se usados)
- **Subagents criados:** <produto/oportunidade, docs, riscos, outro>
- **Evidências úteis:** <fatos observados, com caminho/linha quando houver>
- **Lacunas para usuário:** <perguntas ainda abertas>
- **Hipóteses não confirmadas:** <não tratar como verdade>

## 7. Sucesso & escopo
- **Sucesso em 1 frase:** <...>
- **Métrica de sucesso:** leading <...> · lagging <...>
- **Menor fatia (MVP/slice):** <...> · **Fora de escopo agora:** <...>

## 8. Regras & Fluxo de negócio
- **Regras/políticas do negócio:** <o que o negócio exige/proíbe — não técnico>
- **Invariantes do domínio (não-técnicos):** <o que sempre precisa valer>
- **Atores/papéis (ótica do negócio):** <quem participa e o que decide/aprova>
- **Fluxo ponta-a-ponta:** <passo a passo do processo, do gatilho ao desfecho>
- **Estados & casos-limite do negócio:** <estados possíveis, exceções, desfechos alternativos>
- **Regulado / compliance (nível de negócio):** <LGPD, contratos, obrigação legal — o que rege>

## DoD da Discovery (negócio)
- [ ] Outcome + métrica/baseline · [ ] oportunidade validada (comportamento, não opinião)
- [ ] 4 riscos avaliados · [ ] sucesso mensurável · [ ] escopo (MVP × fora)
- [ ] regras/invariantes/fluxo de negócio mapeados · [ ] compliance de negócio identificado
- [ ] aditivos aprovados · [ ] handoff (→ discovery desenvolvimento, se for construir)
