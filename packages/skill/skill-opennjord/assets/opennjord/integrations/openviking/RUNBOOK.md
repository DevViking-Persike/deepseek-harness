# RUNBOOK — POC OpenViking

## 1. Pré-requisitos

- projeto consumidor já scaffoldado, com `.spec/`;
- Python 3.10+;
- OpenViking v0.4.x instalado separadamente;
- `curl` para health checks;
- corpus sem segredo e sem conteúdo de produção.

Instalação oficial:

```bash
python3 -m pip install --upgrade openviking
openviking-server init
openviking-server doctor
```

O `init` cria `~/.openviking/ov.conf`; a CLI também pode usar
`~/.openviking/ovcli.conf`. Configure embeddings e VLM conforme a instalação local
escolhida. Nunca copie credenciais para o repositório.

## 2. Isolar o runtime fora do projeto

O workspace relativo do servidor não pode nascer dentro do projeto:

```bash
export OPENVIKING_POC_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/openviking/esteira-poc/<projeto>"
mkdir -p "$OPENVIKING_POC_DATA_DIR"
cd "$OPENVIKING_POC_DATA_DIR"
openviking-server
```

Use `127.0.0.1:1933` como endpoint da POC. A interface de bind pode variar por
versão/configuração do OpenViking: confirme que o processo não escuta em interface
pública. O doctor recusa URLs que não sejam loopback.

## 3. Verificar o ambiente

Em outro terminal, na raiz do projeto consumidor:

```bash
export OPENVIKING_POC_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/openviking/esteira-poc/<projeto>"
bash .opennjord/integrations/openviking/openviking-doctor.sh .
```

O smoke consulta apenas `/health`; não lê `ov.conf`/`ovcli.conf` nem imprime chave.

## 4. Conectar o MCP explicitamente

Para uma POC loopback sem plugin de memória:

```bash
claude mcp add --transport http openviking http://127.0.0.1:1933/mcp
```

Se o servidor exigir API key, siga a configuração oficial do OpenViking/MCP e
mantenha o segredo fora do Git e da saída do agente. Não instale
`openviking-memory@openviking` nesta POC.

Confirme em Claude Code com `/mcp`. Cada recuperação deve ser chamada
explicitamente; não use hooks de início de sessão, prompt, resposta ou compactação.

## 5. Auditar e ingerir o corpus

Primeiro, sempre faça dry-run:

```bash
bash .opennjord/integrations/openviking/openviking-ingest.sh --dry-run .
```

Revise a lista `WOULD_INGEST` e as rejeições. Arquivos com tokens de decisão e
`.spec/reference/memory/` são recusados para evitar gate state e auto-indexação do
relatório da própria POC. Só então:

```bash
bash .opennjord/integrations/openviking/openviking-ingest.sh --apply .
```

O wrapper usa `ov add-resource <arquivo> --wait --parent-auto-create <URI>` e um
URI isolado por projeto. Ele não escreve na `.spec/`.

## 6. Executar cinco casos de consulta

Compare MCP/OpenViking com `rg`, índices Markdown e Graphify quando aplicável:

1. ADR mais relacionado ao tema da sprint ativa;
2. decisão anterior sobre um módulo ou contrato;
3. risco/trade-off semelhante em arquitetura anterior;
4. documento relevante sem conhecer o nome do arquivo;
5. consulta negativa, sem documento correto esperado.

Para cada resultado recuperado:

1. abra o arquivo real;
2. confirme atualidade e escopo;
3. cite `path:linha` no discovery/arquitetura;
4. marque resultado obsoleto ou falso positivo no relatório.

O OpenViking não autoriza transição do cursor nem resultado de gate.

## 7. Registrar e avaliar

```bash
mkdir -p .spec/reference/memory
cp .opennjord/integrations/openviking/poc-report.md.tpl \
  .spec/reference/memory/openviking-poc.md
```

Preencha corpus, versão, queries, posição da fonte correta, baseline, tempo,
falsos positivos e custo operacional. Promova somente se:

- nenhum arquivo proibido foi ingerido;
- nenhuma área de decisão da esteira foi escrita;
- pelo menos 4/5 consultas trouxeram fonte relevante entre os primeiros resultados;
- todos os fatos usados foram reconfirmados com `path:linha`;
- o fallback funcionou com o servidor indisponível.

## 8. Fallback e encerramento

Sem OpenViking, continue com leitura direta, `rg`, Graphify e subagents read-only.
A ausência da ferramenta nunca reprova Discovery, 10a ou D00.

Ao encerrar, remova o MCP pelo mecanismo do cliente e pare o servidor. A exclusão
do diretório de dados é destrutiva: faça-a somente com confirmação humana e após
verificar que o path é o diretório isolado da POC.
