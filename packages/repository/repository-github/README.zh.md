# @deepseek-ai/dsh-repository-github

[English](README.md) | 中文

宿主子插件：在 `ctx.repositories` 上注册 GitHub 代码 forge 的身份、能力与离线状态。

## 服务契约

- 注入 `repositories`（`ctx.repositories`）。
- 注册一个 `id: 'github'` 的 `ForgeProvider` 及其能力（pull request、issue、fork、分支、代码搜索、webhook）。
- 插件销毁时可逆地注销：`apply` 返回 `registerForge` 的 disposer，由 fiber 在拆卸时调用。

## Model Experience

### GitHub Forge 上下文

#### 模型看到什么

`ctx.repositories` 暴露已注册的 GitHub forge 提供方。面向模型的工具查询 forge 能力与状态，以确定支持的仓库操作。

#### Token 影响

Token 用量取决于引用 forge 能力的模型查询操作。

#### KV Cache 影响

提示词前缀的保留取决于调用方的提示词结构与 forge 状态的稳定性。

## Known Limitations and Deferred Work

- 与 GitHub 的远程 HTTP 网络交互及 REST/GraphQL API 集成推迟到后续的提供方包。
