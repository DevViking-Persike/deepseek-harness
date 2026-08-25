# @deepseek-ai/dsh-repository-local

Local repository catalog provider for the repository capability seam (`ctx.repositories`), backed by durable storage domain (`ctx.storageDomain`) and delegating git operations to `ctx.git`.

## Service contract

- Consumes `ctx.git`, `ctx.storageDomain`, and `ctx.repositories`.
- Opens persistent storage domain `repository_catalog` (version 1) holding repository records and registration order.
- Registers a `RepositoryCatalogProvider` into `ctx.repositories` and unregisters on disposal.
- Discovers git repositories via `ctx.git.discover()` without duplicating git inspection logic.
- Publishes repository mutation events (`repositories/changed`) strictly after durable commit.

## Model Experience

### Local Repository Storage Context

#### What the model sees

`ctx.repositories` delegates local catalog queries and scans to `repository-local`. Model-facing tools query this provider to retrieve discovered repositories and persist user additions.

#### Token effect

Token usage scales with the number of repositories returned by catalog queries.

#### KV Cache effect

Prompt prefix retention depends on caller prompt structure and stability of catalog state.

## Known Limitations and Deferred Work

- Remote repository synchronization against cloud forge APIs is deferred to forge-specific remote providers.
