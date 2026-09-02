# Regra 2 — Testes unitários + mutation

## Camada 1 — Princípio universal (agnóstico)

Toda função pública nova precisa de teste. Funções privadas relevantes também. Vale para qualquer linguagem do projeto.

### Critérios (bloqueantes)
- **Cobertura por pacote/módulo testável: ≥ 84%**
- **Eficácia de mutation testing: ≥ 84%**. Na ausência de ferramenta de mutation, reforçar testes via revisão manual de assertivas (cenários limite, erros, branches).
- **Mutation roda sempre junto com os testes.** Se a eficácia cair abaixo de 84%, o teste precisa ser fortalecido antes do commit.
- **Quebra de teste bloqueia commit** — nunca desabilite (`#[ignore]`, `it.skip`, `test.skip`, `@Ignore`, `t.Skip`) para passar CI.
- **Filesystem em teste:** usar o diretório temporário da plataforma. Nunca escreva fora do tempdir.
- **Estilo table-driven** quando há múltiplos casos (vetor de structs; `it.each`; `@parametrized`/`[TestCase]`).

### Motivação
Cobertura sem mutation dá falsa segurança — um teste que não muda quando o production code é mutado não está protegendo nada. O binômio cov + mutation ≥ 84% garante que os testes discriminam comportamento real.

### Exceções aceitas (não contam para o threshold)
- **Entry point/bootstrap fino** do app: a lógica deve estar em módulos testáveis.
- Wrappers de rota/composição pura (sem lógica).
- Tokens de design / config pura, sem lógica.
- Componentes de apresentação pura (UI): testar via snapshot quando crescerem.
- Módulos com ≥ 80% de chamadas a SDK/IO externo (gateways, adapters de framework): aplicar o threshold apenas nas funções puras do módulo.

## Camada 2 — Preset por stack (escolha o do projeto)

> Veja `stacks/`. Comandos concretos por stack.

### Rust
```bash
cargo test                                  # testes
cargo tarpaulin --out Stdout                # cobertura
cargo mutants                               # mutation

# Módulos sem #[cfg(test)]
rg -L '#\[cfg\(test\)\]' <root>
```

### Node-TS
```bash
npm test                                    # testes (vitest/jest)
npm run test -- --coverage                  # cobertura (vitest)
npx stryker run                             # mutation (stryker)

# Arquivos .ts sem *.test.ts
find <root> -name '*.ts' -not -name '*.test.ts' | while read f; do
  base="${f%.ts}"; [ -f "$base.test.ts" ] || echo "sem teste: $f"
done
```

### Python
```bash
pytest                                      # testes
pytest --cov=<pkg> --cov-report=term-missing  # cobertura (pytest-cov)
mutmut run                                  # mutation (mutmut)

# Módulos sem test_*.py correspondente
<prencher: script de verificação>
```

### Go
```bash
go test ./...                               # testes
go test -cover ./...                        # cobertura
go-mutesting ./...                          # mutation

# Arquivos sem _test.go
find <root> -name '*.go' -not -name '*_test.go' | while read f; do
  base="${f%.go}"; [ -f "${base}_test.go" ] || echo "sem teste: $f"
done
```

### C#
```bash
dotnet test                                 # testes (xUnit/NUnit)
dotnet test --collect:"XPlat Code Coverage" # cobertura (coverlet)
Stryker.CLI                                 # mutation (Stryker.NET)
```

### KMP (Kotlin)
```bash
./gradlew test                              # testes JVM/Common
./gradlew jacocoTestReport                  # cobertura (JaCoCo)
# mutation: PIT/PITest (./gradlew pitest)
```

### Svelte/Angular/React
```bash
npm test                                    # vitest/jest
npm run test -- --coverage
npx stryker run
```

### RPA
Testes de fluxo automatizado: framework do vendor (UiPath Test Manager, Blue Prism Automated Testing) ou testes de scripts auxiliares (PowerShell `Pester`, Python `pytest`). Cobertura mede-se sobre os scripts, não sobre o fluxo declarativo. Sem ferramenta de mutation aplicável, em geral — reforçar revisão manual de assertivas.

## Camada 3 — Exemplo concreto (referência)

Função `calculate_discount(price, tier)` com branches `tier == 'gold'`, `tier == 'silver'`, fallback. Teste table-driven:

```typescript
it.each([
  { price: 100, tier: 'gold',   expected: 80 },
  { price: 100, tier: 'silver', expected: 90 },
  { price: 100, tier: 'bronze', expected: 100 },
])('discount for $tier', ({ price, tier, expected }) => {
  expect(calculate_discount(price, tier)).toBe(expected);
});
```

Mutation que inverte `tier == 'gold'` faz o teste falhar → mutante morto.

## Como verificar
```bash
# Escolha o preset da stack em Camada 2.
# 1. Rodar testes + cobertura + mutation.
# 2. Verificar módulos sem teste (grep/script).
# Threshold: cov ≥ 84% E mutation ≥ 84% por pacote/módulo.
```

### Tratando mutantes sobreviventes
1. Abrir o arquivo na linha indicada pelo relatório de mutation.
2. Identificar qual condição/branch não é coberta.
3. Adicionar caso de teste que falharia se a condição fosse invertida.
4. Rodar mutation de novo — esperar eficácia ≥ 84%.
