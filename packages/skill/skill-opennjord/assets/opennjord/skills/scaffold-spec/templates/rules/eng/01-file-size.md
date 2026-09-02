# Regra 1 — Tamanho de arquivo

## Camada 1 — Princípio universal (agnóstico)

**Alvo ~300 linhas, teto ~500 linhas por arquivo de código-fonte** (incluindo arquivos de teste, excluindo linhas em branco). Vale para toda extensão de código relevante do projeto.

- **≤ 300**: confortável, sem ação.
- **300–500**: zona de atenção — aceitável, mas refatore quando for mexer no arquivo se a divisão for natural.
- **> 500**: violação — refatore antes de adicionar feature, ou justifique explicitamente no commit/PR.

### Motivação
Arquivo grande mistura responsabilidades, dificulta revisão e esconde acoplamento. O teto de ~500 dá folga para unidades coesas sem virar desculpa para arquivos-monstro.

### Como aplicar
- Ao abrir um arquivo, se já passa de ~450 linhas, refatorar antes de adicionar feature.
- Split por responsabilidade (a convenção de nome varia por linguagem):
  - **Linguagem modular** (Rust/Go/Swift): `<feature>.<ext>`, `<feature>_<sub>.<ext>`, ou submódulo `<feature>/` + arquivos.
  - **Frontend** (Svelte/Vue/React/Angular): extrair subcomponentes `Foo` + `FooHeader`; mover lógica para `foo.<ts|js>` ao lado.
  - **OOP** (Java/C#/TS/Python): split por responsabilidade `foo.ts`, `foo_validation.ts`.
- Teste também — se o arquivo de teste crescer, dividir por cenário (`foo_happy_test`, `foo_error_test`, ou `foo.test.ts` + `foo.error.test.ts`).
- Componente UI: contar linhas do arquivo inteiro (script + markup + style). Passou de ~500, é hora de quebrar.

### Exceções aceitas
- **Código de terceiro / dependência vendorizada** (cópia versionada no repo — SDK upstream, crate/pacote copiado localmente): isento por decisão explícita; auditorias (`check-rules`) ignoram.
- **Código gerado automaticamente** (`*.gen.*`, saídas de protobuf/json-schema, build artifacts): isento.
- **Entry point fino** do app (ex.: `main`, bootstrap de framework): a lógica deve estar em módulos; o arquivo de entry pode exceder se for só wiring.

## Camada 2 — Preset por stack (escolha o do projeto)

> Veja `stacks/`. Comandos concretos por stack. Substitua `<root>` pelo root de código do projeto.

### Rust
```bash
# Lista violações (> 500 linhas) em crates do app
find <root> -name '*.rs' -not -path '*/target/*' -exec wc -l {} + \
  | sort -rn | awk '$1 > 500'
```

### Node-TS
```bash
find <root> -name '*.ts' -not -path '*/node_modules/*' -not -name '*.gen.*' \
  -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

### Python
```bash
find <root> -name '*.py' -not -path '*/.venv/*' -not -path '*/__pycache__/*' \
  -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

### Go
```bash
find <root> -name '*.go' -not -name '*_gen.go' -not -path '*/vendor/*' \
  -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

### C#
```bash
find <root> -name '*.cs' -not -path '*/obj/*' -not -path '*/bin/*' \
  -not -name '*.Designer.cs' -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

### KMP (Kotlin)
```bash
find <root> -name '*.kt' -not -path '*/build/*' -exec wc -l {} + \
  | sort -rn | awk '$1 > 500'
```

### Svelte/Angular/React
```bash
find <root> -name '*.svelte' -o -name '*.vue' -o -name '*.jsx' -o -name '*.tsx' \
  | xargs wc -l | sort -rn | awk '$1 > 500'
```

### RPA
Geralmente sem código-fonte longo (fluxos declarativos). Quando houver scripts auxiliares (PowerShell/Python/JS embutidos), aplicar o mesmo `find ... | awk '$1 > 500'` sobre esses arquivos.

## Camada 3 — Exemplo concreto (referência)

Serviço `user_service.py` com 620 linhas misturando validação, regras de acesso e chamadas de DB. Dividir em:
- `user_service.py` — orquestração dos use cases (≤ 200 linhas)
- `user_validation.py` — regras de validação pura
- `user_repository.py` — persistência (adapter)

Cada arquivo resultante < 300 linhas, um motivo para mudar cada.

## Como verificar
```bash
# Escolha o preset da stack em Camada 2. Saída esperada: vazia (nenhuma linha > 500).
```
