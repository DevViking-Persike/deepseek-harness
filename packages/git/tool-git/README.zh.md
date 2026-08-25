# @deepseek-ai/dsh-tool-git

[English](README.md) | 中文

基于 [git seam](../git/README.md) 的面向模型的 Git 工具。

## 本包注册什么

| 组 | 工具 | 默认 |
|---|---|---|
| `inspect` | `git_status`、`git_diff`、`git_log` | 开 |
| `mutate` | `git_stage`、`git_unstage`、`git_discard`、`git_commit` | 关 |

读取只观察；它们无法损坏仓库，其价值也不取决于部署方的意见。改动组会写入部署方拥有的仓库——`git_discard` 销毁未提交的工作，`git_commit` 写入历史——因此启用它是部署方的决定。每组各自贡献自己的提示词段落，因此只读组合永远不会向模型描述它并不具备的工具。

注册跟随启用而非可用性。已启用的工具在没有可用后端时依然可见，执行时以结构化的 `GitError` 失败，从而使插件加载顺序与机器状态永远不会进入面向模型的 schema。

## 索引两侧都抵达模型

`git_status` 逐路径报告 `staged=` 与 `unstaged=`，而非一个合并后的词。一个文件可以被暂存为新增，然后又被再次修改，而模型在暂存或提交之前需要知道是哪一种。

## 丢弃保持可撤销

`git_discard` 报告 seam 在保留被替换内容时产生的 `recoveryId`。提示词要求模型把该 id 转达出去，使误丢工作的用户能够取回。

## Config

| 键 | 默认值 | 含义 |
|---|---|---|
| `inspect` | `true` | 注册读取组 |
| `mutate` | `false` | 注册改动组 |
| `inspectTimeoutMs` | `30000` | 一次读取的预算 |
| `mutateTimeoutMs` | `120000` | 一次改动的预算（钩子在此运行） |
| `maxDiffChars` | `40000` | 一次 `git_diff` 每侧的上限 |

`git_diff` 从**头部**截断，这与日志尾部不同：文件有意思的部分在开头，一个模型看不到开头的 diff 是不可用的。

## Model Experience

### System prompt

#### What the model sees

每个启用的组贡献一个段落：读取组位于 order 113，改动组位于 order 114。作用域级的工具限制不会移除这些各自独立注册的段落。

##### 只读 Git 指引

```markdown
Use git_status to see which files changed in a repository and whether each change is staged, git_diff to read one file's before and after content, and git_log to read recent commits. Every repository path must be absolute. These tools only observe; they never stage, discard, or commit anything.
```

##### 改动类 Git 指引

```markdown
Use git_stage and git_unstage to choose what a commit will contain, git_commit to record the staged changes, and git_discard to restore a file. git_discard destroys uncommitted work; it reports a recoveryId you can report back to the user so the change can be restored. Never commit without being asked to.
```

#### Token effect

每个由配置启用的组在每次请求中都有固定的指引开销，即使某个限制隐藏了它的 schema 也是如此。`git_status` 每个改动路径一行加一行分支信息，其上界由 seam 的 `maxChanges` 决定；`git_diff` 每侧至多 `maxDiffChars`；`git_log` 每个提交一行。

#### KV Cache effect

在启用的组、作用域与指引文本不变的前提下前缀稳定。配置启用状态或插件生命周期可能从第一个发生变化的提示词段落起使复用失效；作用域级的 schema 限制不会。工具结果出现在缓存前缀之后。

## Known Limitations and Deferred Work

- **改动组不经审批运行** —— 不存在 Git 专属的权限策略；需要确认的部署方添加一个 `tools/pre-execute` 策略，与 `tool-docker` 立场相同。
- **没有 branch、merge 或远程工具** —— seam 不提供这些操作，本包也不提供。
- **`git_status` 没有路径过滤** —— 大仓库会报告直到 seam 上界为止的每个改动路径；目前没有把模型限制在某个子树的参数。
