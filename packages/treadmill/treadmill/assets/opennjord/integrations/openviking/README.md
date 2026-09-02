# OpenViking — kit opcional de POC

> Memória semântica auxiliar para Discovery/D00 e Arquitetura 10a. Não é skill,
> executor, gate, etapa do cursor nem fonte de verdade da esteira.

## Responsabilidade

- **OpenViking:** recupera ADRs, discoveries, arquiteturas e referências por
  significado.
- **Graphify:** comprova relações do código atual.
- **Archify:** comunica e valida diagramas autorados.
- **`.spec/` + Git:** registram fatos, decisões e evidências canônicas.

Toda recuperação é um **candidato não confiável**. Antes de usá-la, leia a fonte
atual e registre evidência `path:linha`. OpenViking nunca decide DN, contrato,
próxima etapa ou resultado de gate. A política conjunta de invocação está em
`../TOOLS-POLICY.md`.

## Conteúdo do kit

| Arquivo | Papel |
|---|---|
| `RUNBOOK.md` | instalação, execução, MCP explícito e avaliação |
| `openviking-doctor.sh` | smoke local não destrutivo |
| `openviking-ingest.sh` | ingestão allowlist-first; dry-run por padrão |
| `poc-report.md.tpl` | relatório versionável da POC |

O scaffold copia este kit para `.opennjord/integrations/openviking/`, mas não
instala Python/OpenViking, não inicia servidor, não cria store, não altera MCP e
não ativa hooks.

## Fronteiras duras

1. Use somente servidor/CLI/MCP oficiais do OpenViking.
2. Não instale o plugin `openviking-memory` nesta POC: ele injeta e captura
   contexto automaticamente.
3. Mantenha config e store fora do projeto e fora do Git.
4. Nunca ingira segredos, produção, cursor, tasks ou relatórios de gate.
5. Nunca escreva em `.spec/esteira-state.yaml`, tasks, QA, review ou segurança.
6. Ausência, erro ou baixa confiança aciona fallback manual; não bloqueia a
   esteira.

## Corpus inicial

A allowlist do wrapper aceita apenas Markdown versionado em:

- `.spec/reference/`;
- `.spec/discovery/`;
- `.spec/arquitetura/`, somente quando o arquivo não contém token de decisão.

O wrapper também recusa `.spec/reference/memory/`, para não reingerir o relatório
da própria POC. O restante da `.spec/` fica fora do corpus. Paths reais são
resolvidos, symlinks são recusados e allowlist vazia encerra com erro.

## Artefato da avaliação

Quando executar a POC, copie `poc-report.md.tpl` para:

```text
.spec/reference/memory/openviking-poc.md
```

Esse relatório é evidência humana da POC; não é lido pelo tick. O banco vetorial
não deve ser commitado e precisa poder ser reconstruído a partir dos arquivos
canônicos.
