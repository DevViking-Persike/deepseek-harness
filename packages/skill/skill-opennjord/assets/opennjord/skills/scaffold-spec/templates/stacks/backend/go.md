# Preset backend — Go

> Stack: Go (modules). Preset copiável; a Camada 2 das regras referencia estes
> comandos. Thresholds ≥ 84% (cobertura + mutation).

## test_cmd

```bash
go test ./...
```

Com saída verbosa para um pacote:

```bash
go test -v ./internal/domain/...
```

## cov_tool

Cobertura nativa via `-cover`. Threshold ≥ 84%.

```bash
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out | grep total   # confere o total
go tool cover -html=coverage.out                 # relatório HTML
```

Para **falhar o build** abaixo de 84%, use uma ferramenta de verificação
(ex.: script `awk` sobre o total, ou `go-test-coverage`):

```bash
go install github.com/vladopajic/go-test-coverage/v2@latest
go-test-coverage -config .coveragerm.yml         # threshold configurado em 84
```

## mutation_tool

Mutation testing em Go tem opções menos maduras que outras stacks. Use
[gremlins](https://github.com/go-gremlins/gremlins) (preferível) ou
[go-mutesting](https://github.com/zimmski/go-mutesting).

```bash
# gremlins
go install github.com/go-gremlins/gremlins@latest
gremlins unwarn --output report.json ./...

# ou go-mutesting
go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest
go-mutesting ./...
```

Threshold-alvo de mutantes mortos ≥ 84%. Se nenhuma ferramenta rodar no CI
(ex.: suporte de versão de Go, custo), **fallback**: revisão manual de
assertivas por partição de equivalência + bordas (nulo, vazio, off-by-one),
registrada no PR.

## lint_cmd

[golangci-lint](https://golangci-lint.run/) (agrega `govet`, `staticcheck`,
`errcheck`, `ineffassign`, `revive`, etc.) — preferível a `go vet` isolado.

```bash
golangci-lint run
# ou, mínimo nativo:
go vet ./...
```

## typecheck_cmd

Go é estaticamente tipado; o `build` cobre verificação de tipos:

```bash
go build ./...
```

Para checagem sem gerar binário:

```bash
go vet ./...
```

## build_cmd

```bash
go build ./...
# binário específico
go build -o bin/app ./cmd/app
```

## run_dev_cmd

```bash
go run ./cmd/app
# hot reload (opcional): air
#   go install github.com/air-verse/air@latest && air
```

## file_glob

Extensões/roots para a Regra 1 (tamanho, alvo ~300 / teto ~500):

```bash
find . -name '*.go' -not -path './vendor/*' | xargs wc -l | sort -rn | awk '$1 > 500'
```

Ignora `vendor/` e arquivos gerados (`*.pb.go`, `*_gen.go`, `mocks/`).

## arch_violation_grep

Markers de IO/framework que **não** devem aparecer em `domain/` (Regras 3/4).
Ajuste o path conforme o projeto (`ex.:` rotulado).

```bash
# domínio não pode importar IO bruto / HTTP / driver de DB
rg -l 'net/http|database/sql|os/exec|encoding/json' ./internal/domain/

# domínio/aplicação não importam camada de infra/adapters
rg -l 'internal/infrastructure|internal/transport' ./internal/domain/ ./internal/application/

# Esperado: saída vazia.
```

Convenção típima Go: `cmd/` (entrypoints), `internal/domain/` (entidades +
ports/interfaces), `internal/application/` (use cases), `internal/infrastructure/`
(adapters de IO/DB/HTTP), `internal/transport/` ou `internal/api/` (handlers).
Dependências só apontam para dentro.

## conventions

- **Idioma**: pt-BR para mensagens de usuário/comentários; inglês para
  identificadores (package, tipo, função — `PascalCase` se exportado,
  `camelCase` se não-exportado).
- **Packages**: nomes curtos, minúsculos, sem `_` nem `camelCase`
  (`domain`, `users`, `httpclient` — nunca `my_domain`).
- **Erros**: sempre `if err != nil { return ... }`; envolva com `fmt.Errorf`
  + `%w` para preservar a cadeia; nunca `_ =` ignora erro em código de produção.
- **Interfaces**: definidas no consumidor, pequenas (ISP); declare a interface
  no pacote de domínio, a implementação no de infra.
- **Context**: funções que fazem IO recebem `ctx context.Context` como primeiro
  argumento; nunca `context.Background()` dentro de domínio/aplicação.
- **Testes**: arquivo `*_test.go` no mesmo pacote; tabela de casos com
  `tests := []struct{ ... }` + `t.Run(tt.name, ...)`; sem IO real em teste
  unitário — use interfaces/fakes.
- **gofmt/gofumpt**: formatação é obrigatória; nunca commitar código não
  formatado (o lint já cobre).
