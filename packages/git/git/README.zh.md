# @deepseek-ai/dsh-git

[English](README.md) | 中文

Git 能力 seam：`ctx.git`、提供方注册表，以及所有消费方编程所依据的词汇。

## 本包持有什么

| 关注点 | 细节 |
|---|---|
| 服务 | `ctx.git`（`GitRuntime`），每个 context 一个实例 |
| 注册表 | `registerProvider(provider)` 返回销毁器；重复 id 被拒绝 |
| 选择 | 已配置的 id 优先；否则唯一可用的提供方自动入选 |
| 错误 | 带机器可路由 `code` 的 `GitError` |

仓库发现、状态、diff、历史与索引/工作区改动共享一个 seam，因为它们共享同一次仓库解析、同一个选择决策与同一套错误分类。它们的请求与结果类型保持分离。

## 选择

在执行时结算，且从不依赖注册顺序：

| 情形 | 结果 |
|---|---|
| 已配置 id，已注册且可用 | 该提供方 |
| 已配置 id，未注册 | `GIT_PROVIDER_CONFIGURED_MISSING` |
| 已配置 id，已注册但不可用 | `GIT_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 未配置 id，恰好一个可用提供方 | 该提供方 |
| 未配置 id，多个可用提供方 | `GIT_PROVIDER_AMBIGUOUS` |
| 未配置 id，无可用提供方 | `GIT_PROVIDER_UNAVAILABLE` |

可用性按调用重新探测，而非缓存。仓库会在一次普通会话中被初始化、克隆或删除，因此缓存的答案会把操作送往一个已经不适用的后端。

## 索引两侧是彼此独立的事实

`GitFileChange` 分别携带 `index` 与 `worktree`，因为 Git 的两字母状态确实是两个事实：一个文件可以被暂存为新增，然后又在工作区中被再次修改。把它们合并成一个词，恰恰会让 UI 无法在同一行上同时提供暂存与取消暂存。单侧改动中缺席的一半读作 `unmodified`，使消费方在一个封闭联合上做穷尽分支，而不必检测 undefined。

## 每个检出都可寻址

`worktrees` 列出仓库的每个检出。一个仓库总有其主工作区，而 `git worktree add` 会创建更多——每个拥有自己的目录、HEAD 与索引，共享同一个对象数据库。锁定、可修剪与裸仓库状态各自区分，因为它们决定了可以对该检出做什么。

## 丢弃会保留它所替换的内容

`discard` 返回一个 `recoveredOid`，指向它所销毁的内容，可经 `readBlob` 读取。丢弃是此处唯一可能丢失未提交工作的操作，因此本 seam 要求提供方在事后仍使该工作可寻址，而不是让它消失。

## 推送前的检查

`compareBases` 针对每个集成分支报告 `ahead`、`behind` 与是否会冲突。`behind > 0` 是决定推送是否安全的事实。冲突判断不触碰工作区，因此在推送前询问既无成本也无副作用。

## Model Experience

间接地，经由 `dsh-tool-git`，它把仓库状态转化为工具 schema、提示词指引与保留的工具结果 token。

#### KV Cache effect

无直接失效；具名的消费方负责任何请求前缀的变化。

## Known Limitations and Deferred Work

- **没有 merge、rebase 或冲突解决** —— 每一项都是带有自身生命周期与中止点的状态机，本请求/响应契约无法表达；`GitChangeKind.conflicted` 报告冲突存在，但不提供解决手段。
- **没有远程操作** —— push、pull 与 fetch 触及凭据与网络端点，其权限模型是另一个决定；`ahead`/`behind` 报告偏离，但不提供协调手段。
- **没有 branch 或 stash 操作** —— 尚无消费方需要，日后添加是增量的。
- **diff 是整文件而非 patch** —— `GitDiff` 完整携带两侧，因为浏览器就是这样绘制的；需要统一 patch 的消费方自行重建。
