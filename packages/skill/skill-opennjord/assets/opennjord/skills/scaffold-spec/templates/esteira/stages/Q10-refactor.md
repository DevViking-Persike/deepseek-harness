# Etapa Q10 — refatoração corretiva

> Aplica a **Regra 6** (refatoração contínua): rede de segurança → split → DIP →
> simplificar → validar. Um commit = um motivo. Bug pré-existente descoberto no
> caminho → **parar e perguntar** (nunca corrigir no mesmo commit do refactor).
> Implementa o fluxo do command `/refactor`, empacotado como etapa com gate.

## Definition of Ready

- Etapa Q00-check executada com relatório de violações bloqueantes.
- Lista de arquivos-alvo definida (vinda da Q00-check).
- Suíte de testes atual verde (se não, a Q20-test-cov-mutation ainda não rodou — mas os testes
  **existentes** devem passar; se um teste existente já falha, é bug pré-existente:
  parar e reportar antes de refatorar).
- `stacks/<stack>.md` disponível para comandos de teste/lint/typecheck/build.

## Checklist de atividades

Para cada arquivo-alvo, executar **na ordem** (Regra 6):

### 1. Rede de segurança primeiro
- Função alvo sem teste → escrever **teste de caracterização** (cobre
  comportamento atual) antes de qualquer mudança estrutural.
- Confirmar que a suíte existente passa: `test_cmd` (scope do módulo).

### 2. Split por responsabilidade
- Separar responsabilidades distintas em arquivos/módulos próprios.
  - Backend: `<feature>_<subresponsabilidade>.rs` ou submódulo `<feature>/`.
  - Frontend: `<Feature>.svelte` + subcomponentes; lógica em `<feature>.ts`.
- Responsabilidade de outra camada → mover para o módulo correto (Regra 4).
- Preservar API pública, salvo escopo aprovado.

### 3. Injeção de dependências (Regra 3 — DIP)
- Substituir chamadas concretas a SDK/IO por traits/ports do consumidor.
- Camada interna (`domain`/`application`) nunca importa SDK/IO bruto.
- Frontend: nunca chamar `invoke`/IO direto de componente — passar via porta/api.

### 4. Simplificação (Regra 5)
- Remover wrappers/flags booleanas que só repassam.
- Inlinar função usada em 1 lugar.
- Deletar código morto (não comentar).
- Trocar abstração prematura por duplicação simples quando 3 linhas não justificam trait.

### 5. Validar
- Rodar `test_cmd` (scope ampliado após o split).
- Rodar `lint_cmd` + `typecheck_cmd` (0 warning novo).
- Rodar `build_cmd` quando o diff toca build.
- Confirmar tamanho: `file_glob` → arquivos mexidos dentro do alvo (≤300 confortável).

## Definition of Done

- 0 violação bloqueante restante (re-auditável pela Q00-check).
- Suíte de testes verde; `lint_cmd`/`typecheck_cmd`/`build_cmd` verdes.
- Commits granulares: **1 motivo por commit** (ex.: `refactor: split <X> por
  responsabilidade`, `refactor: injetar trait <Y> no <Z>` — separados).
- Relatório: antes/depois (linhas, estrutura), arquivos criados/removidos.

## Gate (bloqueante)

- `lint_cmd`/`typecheck_cmd`/`build_cmd` verde **E** 0 violação bloqueante
  restante **E** Regra 6 respeitada → `ok`, avança à Q20-test-cov-mutation.
- Qualquer falha → `fail`, volta à Q00-check (re-auditar e re-listar).
- **2× reprovado** → parar e pedir humano.

## Comandos (genéricos)

> Concretos em `stacks/<grupo>/<stack>.md`: `test_cmd`, `lint_cmd`,
> `typecheck_cmd`, `build_cmd`, convenções de split da stack.

- Teste de caracterização: `test_cmd` no escopo do módulo antes/depois.
- Pós-split: `test_cmd` no escopo ampliado (novos arquivos).
- Sanidade: `lint_cmd`, `typecheck_cmd`, `build_cmd`.
- Tamanho: `file_glob` + contagem de linhas dos arquivos mexidos.

## Composição graphify (opcional)

Antes do split, entender a rede de dependências evita quebrar invariantes:

```bash
graphify path "<módulo alvo>" "<consumidor mais distante>"
graphify explain "<responsabilidade que será extraída>"
```

Responde: quem depende do que vou mover? Há ciclo latente? O split isola mesmo
a responsabilidade ou cria coupling novo? Use para escolher o ponto de corte.

## Composição archify (opcional, modo documentar)

Se o refactor altera um diagrama versionado, `archify compare` pode comunicar o
delta entre a fonte base e a fonte alvo. O comando não prova a arquitetura real:
confirme cada mudança no código/Graphify. Sem Archify, registre o delta manualmente
no `drift.md`; a ferramenta nunca é requisito do gate.

## Anti-patterns

- Refatorar sem rede de segurança (função sem teste → escrever antes).
- Misturar refactor + bugfix no mesmo commit (Regra 6 explícita).
- Corrigir bug pré-existente descoberto no meio sem perguntar.
- Mudar API pública sem escopo aprovado (quebra contratos/serde).
- Criar trait "por segurança" com 1 implementação e 1 consumidor (Regra 5).
- Deixar código morto comentado (deletar — o git guarda o histórico).
