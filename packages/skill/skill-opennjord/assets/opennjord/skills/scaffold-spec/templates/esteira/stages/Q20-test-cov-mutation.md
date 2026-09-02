# Etapa Q20 — testes, cobertura e mutação

> Garante que o diff produzido tem testes adequados, cobertura ≥ **84%** e
> eficácia de mutation ≥ **84%**. **Mutation roda junto dos testes** (Regra 2) —
> nunca separado. Desabilitar teste para passar é violação automática.

## Definition of Ready

- Etapa Q10-refactor concluída (0 violação bloqueante, checks verdes).
- Diferença de diff estável (commits granulares feitos).
- `stacks/<stack>.md` com `test_cmd`, `cov_tool`, `mutation_tool` definidos.
- Filesystem de teste isolado (`tempfile`/`tmp`) — nada escreve fora do tempdir.

## Checklist de atividades

### 1. Cobrir o que o diff tocou
- Toda função pública nova tem teste. Funções privadas relevantes também.
- Estilo **table-driven** quando há múltiplos casos (vetor de structs no backend,
  `it.each`/`test.each` no frontend).
- Frontend: cobertura de branch, não só linha (decisões lógicas).

### 2. Suíte de testes verde
- Rodar `test_cmd` (suíte completa do módulo/pacote).
- Zero flakiness aceitável aqui — se um teste é flaky, é bug a resolver antes do gate.

### 3. Cobertura ≥ 84%
- Rodar `cov_tool` por pacote/módulo testável.
- Reportar pacotes abaixo de 84%.
- Reforçar testes onde faltar; rerodar até ≥84% por pacote relevante.

### 4. Mutation ≥ 84%
- Rodar `mutation_tool` (junto — não é etapa separada).
- Reportar mutantes sobreviventes.
- Para cada mutante vivo:
  1. Abrir o arquivo na linha indicada.
  2. Identificar qual condição não está coberta.
  3. Adicionar caso de teste que falharia se a condição invertesse.
  4. Rerodar o mutation — esperar eficácia ≥84%.

### 5. Sanidade final
- `test_cmd` verde após reforço.
- Nenhum teste desabilitado (`#[ignore]`, `it.skip`, `test.skip`) para passar.
- Confirmar que o filesystem de teste ficou isolado (sem artefatos no repo).

## Definition of Done

- `test_cmd` verde (suíte completa).
- Cobertura ≥ 84% por pacote/módulo testável (relatório do `cov_tool`).
- Eficácia de mutation ≥ 84% (relatório do `mutation_tool`).
- Nenhum teste desabilitado para passar.
- Relatório: % por pacote antes/depois; mutantes vivos restantes (=0 ou justificados).

## Gate (bloqueante)

- cov ≥ 84% **E** mutation ≥ 84% **E** testes verde **E** sem teste desabilitado
  → `ok`, avança à Q30-review.
- Qualquer métrica abaixo → `fail`, volta à Q10-refactor (faltou rede de
  segurança/cobertura — o refactor precisa deixar o código testável).
- **2× reprovado** → parar e pedir humano.

## Comandos (genéricos)

> Concretos em `stacks/<grupo>/<stack>.md`: `test_cmd`, `cov_tool`, `mutation_tool`.

- Suíte: `test_cmd` (verbose no módulo; full no fechamento).
- Cobertura: `cov_tool` com relatório por pacote.
- Mutation: `mutation_tool` (sharding permitido para suites grandes — consolidar).
- Validação de "sem ignore": grep de marcadores de skip no diff (`#[ignore]`,
  `it.skip`, `test.skip`, `xtest`) — deve retornar vazio no diff novo.

## Composição graphify (opcional)

Para decidir **onde** reforçar testes com maior alavanca:

```bash
graphify query "quais funções públicas do diff são chamadas por mais módulos?"
```

Funções de alto impacto (muitos consumidores) merecem cobertura de branch mais
robusta antes de funções internas. Não é obrigatório — é priorização.

## Anti-patterns

- Rodar mutation separado dos testes (Regra 2: sempre juntos).
- Desabilitar teste (`#[ignore]`, `it.skip`) para o CI passar.
- Mirar 100% cego: cobertura de linha sem cobertura de branch não valida lógica.
- Testar implementação em vez de comportamento (fica frágil ao refatorar).
- Setup de 20 linhas para 1 caso — sinal de que a função sob teste faz muita coisa.
- Escrever fora do tempdir (contamina o repo com artefatos de teste).
- Tratar "mutation demora" como desculpa para pular (use sharding, não skip).
