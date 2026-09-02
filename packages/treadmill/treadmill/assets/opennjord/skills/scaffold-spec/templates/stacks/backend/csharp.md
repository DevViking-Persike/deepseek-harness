# Preset backend — C# / .NET

> Stack: .NET (C#). Preset copiável; a Camada 2 das regras referencia estes
> comandos. Thresholds ≥ 84% (cobertura + mutation).

## test_cmd

```bash
dotnet test --nologo
```

Para um projeto específico:

```bash
dotnet test src/MyApp.Tests/MyApp.Tests.csproj --nologo
```

## cov_tool

[Coverlet](https://github.com/coverlet-coverage/coverlet) via MSBuild ou global
tool. Threshold ≥ 84%.

```bash
# via MSBuild ( adiciona Coverlet.MSBuild ao projeto de testes )
dotnet test --collect:"XPlat Code Coverage" \
  /p:CoverletOutputFormat=cobertura \
  /p:Threshold=84 /p:ThresholdType=line

# via global tool
dotnet tool install -g dotnet-coverage
dotnet coverage collect dotnet test --output cobertura.xml --output-format cobertura
```

Falha o build se cobertura de linha < 84% (`/p:Threshold`).

## mutation_tool

[Stryker.NET](https://stryker-mutator.io/docs/stryker-net/introduction/).
Threshold ≥ 84%.

```bash
dotnet tool install -g dotnet-stryker
dotnet stryker --threshold-high 84 --threshold-break 84
```

Se o projeto não puder rodar Stryker (ex.: solution muito grande, CI sem
runtime .NET compatível), **fallback**: revisão manual das assertivas por borda
(equivalência de partição + casos nulo/vazio/limit), registrada no PR.

## lint_cmd

[dotnet format](https://learn.microsoft.com/dotnet/core/tools/dotnet-format) +
analyzers (EditorConfig / `.editorconfig` + `Microsoft.CodeAnalysis.NetAnalyzers`).

```bash
dotnet format --verify-no-changes        # verifica sem reescrever (CI)
dotnet format                            # reescreve (local)
```

## typecheck_cmd

C# é estaticamente tipado; o equivalente é o `build` com analyzers ligados:

```bash
dotnet build --nologo -warnaserror        # warnings = erros
```

## build_cmd

```bash
dotnet build --nologo
# release
dotnet publish -c Release -o ./publish
```

## run_dev_cmd

```bash
dotnet run --project src/MyApp            # hot reload: dotnet watch run
```

## file_glob

Extensões/roots para a Regra 1 (tamanho de arquivo, alvo ~300 / teto ~500):

```bash
# listar violações (> 500 linhas)
find src tests -name '*.cs' | xargs wc -l | sort -rn | awk '$1 > 500'
```

Roots típicos: `src/` (produção), `tests/` (testes). Cada `.cs` de produção ou
teste conta.

## arch_violation_grep

Markers de framework/IO que **não** devem aparecer em camadas de domínio/aplicação
(Regras 3/4 — DIP / Clean Architecture). Ajuste o path da camada de domínio
conforme o projeto (`ex.:` rotulado).

```bash
# Camada de domínio não pode depender de ASP.NET Core (HTTP/IO)
rg -l 'using Microsoft\.AspNetCore|using Microsoft\.EntityFrameworkCore|using System\.Net\.Http' src/MyApp.Domain/

# Camada de domínio/aplicação não importa camada de UI/Controllers
rg -l 'using MyApp\.Controllers|using MyApp\.Infrastructure' src/MyApp.Domain/ src/MyApp.Application/

# Esperado: saída vazia.
```

Convenção típima .NET: projetos `MyApp.Domain`, `MyApp.Application`,
`MyApp.Infrastructure`, `MyApp.Api` — referências só apontam para dentro
(`Api → Application → Domain`; `Infrastructure → Domain` via interfaces em `Domain`).

## conventions

- **Idioma**: pt-BR para mensagens de usuário/comentários; inglês para
  identificadores (namespace, classe, método — `PascalCase`).
- **Nomenclatura**: `PascalCase` para classe/método/propriedade pública;
  `_camelCase` para fields privados; `IFoo` para interfaces.
- **Async**: sufixo `Async` em métodos assíncronos (`GetUserAsync`); `await`
  nunca `.Result`/`.Wait()`.
- **DI**: registrar dependências no `Program.cs` / `Startup.cs`; camadas de
  domínio/aplicação declaram construtores com interfaces, nunca `new` de
  implementação concreta de IO.
- **Nullable reference types**: ligar `<Nullable>enable</Nullable>`; tratar
  warnings como erro.
- **Testes**: xUnit ou NUnit, estilo AAA; preferir `[Theory]` + `[InlineData]`
  para casos múltiplos (equivalente ao table-driven).
