# Preset backend — Python

> Stack: Python (3.10+). Preset copiável; a Camada 2 das regras referencia estes
> comandos. Thresholds ≥ 84% (cobertura + mutation).

## test_cmd

```bash
pytest
# por pacote
pytest tests/domain/
```

## cov_tool

[pytest-cov](https://pytest-cov.readthedocs.io/). Threshold ≥ 84%.

```bash
pytest --cov=src --cov-report=term-missing --cov-fail-under=84
```

`--cov-fail-under=84` faz o pytest falhar se cobertura < 84%.

## mutation_tool

[mutmut](https://github.com/boxed/mutmut) ou
[cosmic-ray](https://github.com/sixty-north/cosmic-ray). Threshold ≥ 84%.

```bash
# mutmut
pip install mutmut
mutmut run
mutmut results          # ver mutantes sobreviventes
mutmut html             # relatório

# cosmic-ray
pip install cosmic-ray
cosmic-ray init config.toml
cosmic-ray exec config.toml
```

Threshold-alvo de mutantes mortos ≥ 84%. Se o projeto for grande e mutation no
CI for proibitivo, **fallback**: revisão manual de assertivas por partição de
equivalência + bordas (`None`, `""`, `[]`, `0`, negativos), registrada no PR.

## lint_cmd

[Ruff](https://docs.astral.sh/ruff/) (preferível — substitui flake8/pylint/isort
numa ferramenta):

```bash
ruff check .
ruff format --check .      # equivalente a black --check
```

## typecheck_cmd

[mypy](https://mypy-lang.org/) ou [pyright](https://github.com/microsoft/pyright):

```bash
mypy src/                 # com mypy.ini / pyproject.toml configurado strict
# ou
pyright src/
```

## build_cmd

Python é interpretado; "build" = empacotar para distribuição:

```bash
# poetry
poetry build              # gera sdist + wheel em dist/

# uv
uv build

# instalável em modo dev
pip install -e .
```

## run_dev_cmd

```bash
# CLI / script direto
python -m src.app

# servidor web (ex.: uvicorn / fastapi)
uvicorn src.app:app --reload
```

## file_glob

Extensões/roots para a Regra 1 (tamanho, alvo ~300 / teto ~500):

```bash
find src tests -name '*.py' | xargs wc -l | sort -rn | awk '$1 > 500'
```

Ignora `__pycache__/`, `.venv/`, `dist/`, `build/`. Roots típicos: `src/`
(produção), `tests/` (testes).

## arch_violation_grep

Markers de IO/framework que **não** devem aparecer em `domain/` (Regras 3/4).
Ajuste o path conforme o projeto (`ex.:` rotulado).

```bash
# domínio não importa SDK/IO (requests, httpx, sqlalchemy, os, subprocess)
rg -l 'import requests|import httpx|import sqlalchemy|import os|import subprocess|from fastapi|from flask' src/domain/

# domínio/aplicação não importam camada de controllers/routes/infra
rg -l 'from .controllers|from .infrastructure|from .routes|from src.api' src/domain/ src/application/

# Esperado: saída vazia.
```

Convenção típima Python: pacote `src/` (src-layout); `src/domain/` (entidades +
`Protocol`/`ABC` de ports), `src/application/` (use cases),
`src/infrastructure/` (adapters de IO/DB/HTTP), `src/api/` ou `src/controllers/`
(handlers). Domínio define `Protocol`, infra implementa.

## conventions

- **Idioma**: pt-BR para mensagens de usuário/comentários/docstrings; inglês
  para identificadores (módulo, classe, função — `snake_case` para função/variável,
  `PascalCase` para classe).
- **Tipagem**: type hints obrigatórios (`def foo(x: int) -> str:`); `from
  __future__ import annotations` para syntax moderna; `Optional[X]`/`X | None`
  explícito; sem variável sem tipo em API pública.
- **Protocol/ABC**: ports como `typing.Protocol` (structral) ou `abc.ABC`
  (nominal) em `domain/`; infra implementa. Domínio não conhece a implementação.
- **Erros**: exceções customizadas hierárquicas (`class DomainError(Exception)`,
  `class UserNotFound(DomainError)`); nunca `except Exception:` genérico sem
  re-raise; usar `raise ... from err` para preservar a causa.
- **Dataclasses / Pydantic**: modelar entidades de domínio com `@dataclass`
  (frozen quando imutável); Pydantic só na borda (DTO/API), não em domínio puro.
- **Testes**: arquivo `test_*.py` em `tests/` espelhando `src/`; `pytest.mark.
  parametrize` para casos múltiplos (table-driven); `tmp_path` fixture para
  filesystem; sem IO real em teste de domínio — use fakes/mocks das Protocol.
- **Ambiente**: `pyproject.toml` como fonte de verdade (deps, ruff, mypy,
  pytest config); `uv` ou `poetry` para lock; nunca `requirements.txt` solto
  como canônico.
- **Docstrings**: estilo Google ou NumPy em funções públicas; explicar o
  *porquê*, não o *quê* (Regra 5 do projeto-fonte).
