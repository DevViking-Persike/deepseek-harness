# stacks/ — Presets de stack técnica

Cada arquivo aqui é um **preset copiável** com os comandos reais de uma stack
(teste, cobertura, mutation, lint, typecheck, build, dev, glob, grep de arquitetura,
conventions). A Camada 2 das regras em `rules/eng/` referencia estes presets em
vez de embutir comandos — mantemos a regra universal e a stack concreta separadas.

## Como os presets compõem

Um projeto típimo escolhe **uma stack por grupo**, formando seu conjunto:

| Grupo     | Presets disponíveis                          | Quando escolher                           |
|-----------|----------------------------------------------|-------------------------------------------|
| backend   | `csharp`, `go`, `rust`, `nodejs`, `python`   | API, serviço, domínio server-side         |
| frontend  | (preset separado, ex.: `svelte`, `react`)    | UI web                                    |
| mobile    | (preset separado, ex.: `kmp`, `react-native`)| App nativo/cross-platform                 |
| rpa       | (preset separado, ex.: `playwright`)         | Automação de browser/UI                   |

Projetos multi-stack referenciam múltiplos presets. A regra universal
(`rules/eng/0N-*.md`) diz o *princípio*; o preset diz *como* na stack escolhida.

## Como o projeto escolhe seu conjunto (na instalação)

Ao rodar `scaffold-spec` (ou equivalente), o projeto decide:

1. **Backend** — um entre `backend/*.md` (csharp | go | rust | nodejs | python).
2. **Frontend** — um entre `frontend/*.md` (conforme disponível).
3. **Mobile** — opcional, `mobile/*.md` quando aplicável.
4. **RPA** — opcional, `rpa/*.md` quando aplicável.

A escolha fica registrada no `.spec/MANIFEST` (ou doc equivalente do projeto).
As regras da Camada 2 só citam o preset ativo — os demais são ignorados na
auditoria. Não instalar preset de stack não usada (evita ruído em greps).

## Mapa dos arquivos

```
stacks/
├── README.md            (este arquivo — índice + composição)
├── backend/
│   ├── csharp.md        (.NET / C#)
│   ├── go.md            (Go)
│   ├── rust.md          (Rust + cargo)
│   ├── nodejs.md        (Node + TypeScript)
│   └── python.md        (Python)
├── frontend/            (presets de UI web — grupo separado)
├── mobile/              (presets mobile — grupo separado)
└── rpa/                 (presets de automação — grupo separado)
```

## Convenção dos blocos

Cada preset expõe os mesmos blocos, sempre comando **real da stack**
(não placeholder):

`test_cmd` · `cov_tool` (threshold ≥ 84%) · `mutation_tool` (≥ 84%; se não houver
ferramenta madura, fallback de revisão manual) · `lint_cmd` · `typecheck_cmd` ·
`build_cmd` · `run_dev_cmd` · `file_glob` (extensões/roots para a Regra 1 de
tamanho) · `arch_violation_grep` (markers de framework/IO para Regras 3/4) ·
`conventions` (notas de idioma da stack).

Os thresholds ≥ 84% vêm da regra de testes (referência: `rules/eng/02-*.md`,
espelha `02-unit-tests.md` do projeto-fonte). Se a stack não tem mutation tester
maduro, o preset declara explicitamente e dá fallback (revisão manual de
assertivas + reforço de casos por borda).

## Anti-patterns

- ❌ Embutir comando de stack no corpo da regra universal (use Camada 2 → preset).
- ❌ Preset genérico sem comando real (`<preencher: cmd de teste>` é erro).
- ❌ Citar particulares de um projeto-fonte como prescrição — só `ex.:` rotulado.
