# @deepseek-ai/dsh-repository

Repository capability seam (`ctx.repositories`): a provider registry and execution coordinator for repository catalog management and forge subplugin registrations.

## Service contract

- `registerForge(forge: ForgeProvider): () => void` — registers a forge provider and emits `repositories/forge-registered`; returns a disposer that unregisters the forge and emits `repositories/forge-unregistered`.
- `registerCatalogProvider(provider: RepositoryCatalogProvider): () => void` — registers a local repository catalog provider; returns a disposer.
- `listForges(): readonly ForgeProvider[]` — returns all currently registered forge providers.
- `getForge(id: ForgeId | string): ForgeProvider | undefined` — returns a registered forge provider by id.
- `listProviders()` — lists all registered catalog provider ids and forge provider ids.
- `subscribe(listener): () => void` — subscribes to repository mutations (`repositories/changed`).
- `list(filter?, signal?)` — lists repositories matching filter criteria.
- `get(id, signal?)` — retrieves a single repository by its branded identifier.
- `getByPath(path, signal?)` — retrieves a repository by its filesystem path.
- `add(request, signal?)` — adds a local repository to the catalog.
- `remove(id, signal?)` — removes a repository from the catalog.
- `scan(request, signal?)` — scans directory roots for git repositories and registers them.

## Model Experience

### Repository Catalog and Forge Context

#### What the model sees

`ctx.repositories` coordinates repository catalog inspection and forge subplugin registrations. Model-facing tools query this service to inspect local repositories, check branch status, and resolve forge capabilities.

#### Token effect

Token usage scales with the number of repositories and details returned by catalog listing operations.

#### KV Cache effect

Prompt prefix stability depends on consumer tool presentation and catalog change frequency.

## Known Limitations and Deferred Work

- Remote HTTP network interactions for GitHub and GitLab forge providers are deferred to subsequent implementation.
