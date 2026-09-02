# Preset de Stack — Python RPA (Selenium / Playwright / Robocorp)

> Comando **real** da stack. Vale para automação RPA com Python 3.10+: Selenium WebDriver,
> Playwright (mais rápido, async), ou Robocorp (rpaframework). Aplica Clean Architecture:
> domain/orquestração puros, infrastructure com o driver/browser, page-objects isolam seletores.

## test_cmd

```bash
# pytest (unitários de funções puras e page-objects com fixtures):
pytest
# Verbose, filter:
pytest -v tests/test_login_page.py -k "valido"

# Testes que tocam browser usam marca e são seletivamente pulados em CI sem browser:
pytest -m "not browser"     # só testes que não abrem browser
pytest -m "browser"          # só E2E com browser (exige driver instalado)
```

Registre markers em `pyproject.toml`: `markers = ["browser: abre browser real (E2E)"]`.

## cov_tool

Threshold **≥ 84%** por módulo. `pytest-cov` (backend `coverage.py`).

```bash
pytest --cov=src --cov-report=html --cov-report=term-missing
# HTML: htmlcov/index.html
# Falha se abaixo do limite:
pytest --cov=src --cov-fail-under=84
```

Configura em `pyproject.toml`:
```toml
[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*", "*/__main__.py"]
[tool.coverage.report]
fail_under = 84
```

**Nota:** testes E2E com browser real contam para cobertura, mas devem ser complementados por
testes unitários das funções de parse/transformação (puras) — o gate de 84% é sobre `src/`.

## mutation_tool

Threshold **≥ 84%**. **mutmut** (mutante para Python).

```bash
# Instala: pip install mutmut
# Configura em setup.cfg ou pyproject:
#   [tool.mutmut]
#   paths_to_mutate = "src"
#   runner = "python -m pytest -x -q --no-header"
mutmut run
# Resultados: .mutmut-cache
mutmut results            # lista mutantes sobreviventes
mutmut html               # HTML: html/index.html
```

`mutmut` roda com o runner de testes que você já tem (pytest). Para acelerar, restrinja
`paths_to_mutate` aos módulos de domain/application (funções puras) — mutação de código de
browser/driver é cara e de baixo valor (E2E cobre indiretamente).

**Fallback:** para funções que abrem browser (`def run_bot(...)`), mutmut raramente é eficaz
(poucos testes cobrem, setup caro). Revisão manual de branches críticos de orquestração (fluxo
de etapas, tratamento de exceção de `TimeoutException`, retries) — documentar no PR quando o
gate de mutação é atendido só por módulos puros.

## lint_cmd

```bash
# ruff (lint + format, substitui flake8/isort/pyupgrade):
ruff check src tests
ruff check --fix src tests     # auto-fix
ruff format src tests          # formatação (substitui black)

# Alternativa completa: flake8 + black + isort (legado):
flake8 src tests
black --check src tests
isort --check-only src tests
```

## typecheck_cmd

```bash
# mypy (type checker estático):
mypy src
# Strict:
mypy --strict src

# Alternativa: pyright (mais rápido, usado pelo Pylance):
pyright src
```

Configure `py.typed` marker nos pacotes e types nas funções públicas (`def parse(x: str) -> int:`).

## build_cmd

```bash
# Empacotamento wheel/sdist:
python -m build
# Output: dist/*.whl, dist/*.tar.gz

# Robocorp: zip da task para o Control Room / local dev:
rcc task package
# Ou robocorp/tasks:
python -m robocorp.tasks package
```

## run_dev_cmd

```bash
# Rodar task RPA localmente (modo dev, headed browser p/ depurar):
python -m robocorp.tasks run tasks/main.py
# Robocorp (rcc):
rcc task run

# Selenium/Playwright direto (entry point custom):
python -m src.main
# Com variáveis de ambiente:
NJORD_ENV=dev python -m src.main

# Playwright headed com slow-mo (depuração de seletores):
PLAYWRIGHT_HEADLESS=false python -m src.main --slow-mo 500
```

Instalar browsers do Playwright uma vez: `playwright install`.

## file_glob

Arquivos sujeitos à Regra 1 (≤ 300 / teto 500 linhas):

- `**/*.py`

```bash
# Lista violações:
find src tasks -name '*.py' -not -path '*/.venv/*' -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

## arch_violation_grep

Markers de framework/IO (Regra 3/4): **domain/orquestração pura não importa driver/browser/requests/selenium**.
Toda interação com browser/http/FS vive em `infrastructure/`, orquestrada por `application/` via ports.

```bash
# domain/application importando driver/browser/IO = violação
rg -l 'from selenium|import selenium|from playwright|import playwright|requests\.|urllib|bs4|from rpaframework|open\(|pathlib' \
  src/*/domain src/*/application 2>/dev/null
# Esperado: vazio.

# Page-object ou task referenciando domain/application fora de ports = acoplamento errado
rg -l 'from .*\.(domain|application)\.' src/*/infrastructure 2>/dev/null | \
  rg -v 'port|adapter|impl'
```

> `ex.:` `PedidoRepository` (port em `domain/ports/`) é interface; `PedidoSeleniumRepository`
> (em `infrastructure/`) implementa usando `selenium.webdriver`. O use case
> `ExtrairPedidosUseCase` depende da port injetada, nunca do driver.

## conventions

- **Idioma:** pt-BR para comentários/mensagens de erro/logs; inglês para identificadores
  (`def extrair_pedidos`, `class PedidoPageObject`).
- **Page Object Pattern:** cada página/fluxo do site alvo é uma classe (`LoginPage`, `PedidosPage`)
  que encapsula seletores (CSS/XPath) e ações (`preencher_email`, `clicar_salvar`). Seletores
  **nunca** fora do page-object — mudança de layout = mudar um arquivo só.
- **Seletores isolados:** prefira `data-testid` atribuído em concordância com o site alvo quando
  possível; CSS estável (`#email`) > XPath frágil (`/html/body/div[3]/form/input[2]`).
- **Tasks vs resources:** Robocorp segue `tasks.py` (entry points, orquestração) + `libraries/`
  (page-objects, helpers). Task não tem lógica de driver; só chama use cases.
- **Variáveis de ambiente:** `python-dotenv` ou `os.environ.get("TOKEN")`; nunca hardcoded.
- **Logging estruturado:** `logging` + `structlog` ou `loguru`. Screenshots em falha E2E
  (`page.screenshot(path=...)`) salvos em `artifacts/` para depuração.
- **Retries e waits:** Playwright: `page.wait_for_selector(sel, timeout=5000)` (explícito).
  Selenium: `WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS, sel)))`.
  **Proibido** `time.sleep()` fixo — flaky. Usa-se `tenacity` para retries de negócio.
- **Async (Playwright):** `async def` + `asyncio.run(main())`. Cada page-object async; tasks
  awaitam. Misturar sync/async no mesmo fluxo é anti-pattern.
- **Testes de page-object:** fixture com `mocker.patch` no driver; testa que o page-object chama
  os seletores/fluxos certos, sem abrir browser real. E2E (`-m browser`) valida fluxo ponta-a-ponta.
- **Tipos:** `typing.Protocol` para ports (structural typing Python), classes `@dataclass` para
  modelos de domínio. Sem `Any` em funções públicas.
- **Dependências:** `requirements.txt` ou `pyproject.toml` com versões pinadas (`selenium==4.21.0`).
  Robocorp usa `conda.yaml` para environment lock.

## Exemplo: fronteira Clean Architecture em RPA

```
src/
  domain/
    model/pedido.py              # @dataclass Pedido
    ports/pedido_repository.py   # Protocol com listar_pedidos() -> list[Pedido]
  application/
    extrair_pedidos.py           # ExtrairPedidosUseCase(repo: PedidoRepository)
  infrastructure/
    pedido_selenium_page.py      # page-object (selenium), implementa PedidoRepository
    pedido_playwright_page.py    # alternativa async (playwright)
  commands/
    tasks.py                     # @task entry point Robocorp, injeta repo concreto
```

O use case `ExtrairPedidosUseCase` não sabe se o backend é Selenium ou Playwright — depende da
port. Trocar framework = trocar o adapter injetado em `commands/tasks.py`.
