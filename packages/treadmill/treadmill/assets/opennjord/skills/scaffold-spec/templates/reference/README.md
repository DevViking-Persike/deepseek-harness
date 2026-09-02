# Referência do projeto

> Índice vivo de documentação, ADRs e diagramas. O scaffold cria este arquivo;
> Discovery, Arquitetura, Desenvolvimento documental, Review e QA o atualizam
> incrementalmente. Afirmação técnica deve apontar para evidência `path:linha`.

## Documentos

| Documento | Papel | Evidência/base |
|---|---|---|
| <preencher: path do documento> | <preencher: roadmap, glossário, deploy, observabilidade ou runbook> | <preencher: código, config, comando ou ADR> |

## ADRs

| ADR | Decisão | Status |
|---|---|---|
| `ADR-NNN.md` | <preencher: decisão estrutural> | <proposto\|aceito\|superado> |

## Diagramas

Cada diagrama fica com sua fonte, entrega e evidências no mesmo diretório:

```text
diagrams/<tipo>-NN-<tema>/
├── <tipo>-NN-<tema>.archify.json
├── <tipo>-NN-<tema>.html
├── <tipo>-NN-<tema>.receipt.json
├── <tipo>-NN-<tema>.delta.html      # quando houver base/head
└── drift.md                         # quando houver divergência
```

Tipos: `architecture`, `workflow`, `sequence`, `dataflow` ou `lifecycle`.

| Diagrama | Tipo | Fonte factual | Entrega | Estado |
|---|---|---|---|---|
| <preencher: tema> | <preencher: tipo> | <preencher: paths:linhas/Graphify> | <preencher: path HTML ou Markdown> | <atual\|drift> |

## Memória semântica opcional

Quando a POC OpenViking for executada, registre somente o relatório humano em:

```text
memory/openviking-poc.md
```

O store fica fora do Git; o relatório não é lido pelo tick nem ingerido no corpus
da POC, e cada recall usado precisa de confirmação `path:linha`.

## Subfluxo documental D00–D50

1. **D00 — inventário e evidências:** OpenViking recupera contexto candidato;
   ler código/config/infra e usar Graphify opcionalmente para relações atuais.
2. **D10 — modelagem:** autorar o JSON; `archify guide` é apoio opcional.
3. **D20 — validação estrutural:** `archify validate`, ou revisão manual.
4. **D30 — preview:** `archify preview`, ou Mermaid/ASCII.
5. **D40 — entrega:** `archify deliver` gera HTML + receipt.
6. **D50 — fidelidade/drift:** review doc↔código; `archify compare` opcional.

Os códigos D organizam documentação; não são etapas do cursor nem gates.

## Composição opcional

- **OpenViking** recupera memória/contexto por MCP explícito, sem plugin ou
  auto-injeção nesta POC. Kit: `.opennjord/integrations/openviking/`.
- **Graphify** extrai relações do código real.
- **Archify** comunica/valida um diagrama autorado; não analisa o repositório.
  Pré-requisito: Node ≥18; instalação externa:
  `npx skills add tt-a1i/archify -g`.

Sem OpenViking, use busca/leitura direta. Sem Archify, use Markdown +
Mermaid/ASCII, diff manual e os mesmos gates 10b/QA. Ausência das ferramentas
nunca bloqueia a esteira por si só.
