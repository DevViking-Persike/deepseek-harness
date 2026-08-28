# @deepseek-ai/dsh-repository

[English](README.md) | 中文

仓库能力 seam（`ctx.repositories`）：一个提供方注册表与执行协调器，负责仓库目录管理与 forge 子插件注册。

## 服务契约

- `registerForge(forge: ForgeProvider): () => void` —— 注册一个 forge 提供方并发出 `repositories/forge-registered`；返回一个注销该 forge 并发出 `repositories/forge-unregistered` 的销毁器。
- `registerCatalogProvider(provider: RepositoryCatalogProvider): () => void` —— 注册一个本地仓库目录提供方；返回销毁器。
- `listForges(): readonly ForgeProvider[]` —— 返回当前已注册的全部 forge 提供方。
- `getForge(id: ForgeId | string): ForgeProvider | undefined` —— 按 id 返回已注册的 forge 提供方。
- `listProviders()` —— 列出全部已注册的目录提供方 id 与 forge 提供方 id。
- `subscribe(listener): () => void` —— 订阅仓库变更（`repositories/changed`）。
- `list(filter?, signal?)` —— 列出符合过滤条件的仓库。
- `get(id, signal?)` —— 按品牌化标识符检索单个仓库。
- `getByPath(path, signal?)` —— 按文件系统路径检索仓库。
- `add(request, signal?)` —— 向目录添加一个本地仓库。
- `remove(id, signal?)` —— 从目录移除一个仓库。
- `scan(request, signal?)` —— 扫描目录根查找 git 仓库并注册它们。

## Model Experience

### 仓库目录与 Forge 上下文

#### 模型看到什么

`ctx.repositories` 协调仓库目录检查与 forge 子插件注册。面向模型的工具查询此服务来检查本地仓库、查看分支状态并解析 forge 能力。

#### Token 影响

Token 用量随目录列举操作返回的仓库数量与详情规模而变化。

#### KV Cache 影响

提示词前缀的稳定性取决于消费方工具的呈现方式与目录变更频率。

## Known Limitations and Deferred Work

- GitHub 与 GitLab forge 提供方的远程 HTTP 网络交互推迟到后续实现。
