# @deepseek-ai/dsh-repository-local

[English](README.md) | 中文

仓库能力 seam（`ctx.repositories`）的本地仓库目录提供方：由持久存储域（`ctx.storageDomain`）支撑，并将 git 操作委托给 `ctx.git`。

## 服务契约

- 消费 `ctx.git`、`ctx.storageDomain` 与 `ctx.repositories`。
- 打开持有仓库记录与注册顺序的持久存储域 `repository_catalog`（版本 1）。
- 向 `ctx.repositories` 注册一个 `RepositoryCatalogProvider`，并在销毁时注销。
- 通过 `ctx.git.discover()` 发现 git 仓库，不重复 git 检查逻辑。
- 严格在持久提交之后发布仓库变更事件（`repositories/changed`）。

## Model Experience

### 本地仓库存储上下文

#### 模型看到什么

`ctx.repositories` 将本地目录查询与扫描委托给 `repository-local`。面向模型的工具查询此提供方来检索已发现的仓库并持久化用户新增。

#### Token 影响

Token 用量随目录查询返回的仓库数量而变化。

#### KV Cache 影响

提示词前缀的保留取决于调用方的提示词结构与目录状态的稳定性。

## Known Limitations and Deferred Work

- 面向云 forge API 的远程仓库同步推迟到 forge 专属的远程提供方。
