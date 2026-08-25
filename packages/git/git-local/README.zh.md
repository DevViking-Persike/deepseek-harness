# @deepseek-ai/dsh-git-local

[English](README.md) | 中文

[git seam](../git/README.md) 的本机 `git` CLI 后端，通过 `ctx.subprocess` 执行。

## 为什么用 CLI

索引格式、重命名检测、`.gitattributes` 过滤器与工作区/子模块解析，正是 JavaScript 重新实现会在每个 Git 版本上产生偏差的部分。本 seam 的价值在于与用户自己终端里的 `git` 保持一致，因此后端就是 CLI。

每个操作都是一次短生命周期调用，使用固定 argv——绝不使用 shell 字符串——且每个路径参数都放在 `--` 之后，使得名字形似选项的文件仍被当作路径。`available()` 执行 `git --version`。

## 机器可读格式

| 读取 | 格式 | 决定解析器的规则 |
|---|---|---|
| status | `--porcelain=v2 --branch -z` | 重命名占用**两**条 NUL 记录：条目本身，然后是原路径 |
| 行数统计 | `diff --numstat -z` | 重命名占用**三**条记录；二进制文件报告 `-`（没有计数，而非零） |
| 历史 | 带 NUL 字段、RS 记录的 `--format` | 两个分隔符都是提交信息无法包含的控制字符 |
| 工作区 | `worktree list --porcelain -z` | 未说明原因的 `locked` 只发出裸标志，但仍读作已锁定 |
| 图谱 | 带 US 字段、RS 记录的 `--format` | `%D` 中的 `HEAD -> main` 被拆开，使泳道标签只是分支名 |

`-z` 分帧正是让含空格、换行与非 ASCII 名称的路径安全的原因：记录以 NUL 分隔，路径从不加引号或转义。

缺失的事实保持缺失而不变成错误：没有上游的分支完全不输出 `# branch.ab`，读作零偏离；未诞生的分支报告 `(initial)`，读作没有 head 提交。

## 发现

`discover` 对每个根做广度优先遍历直到请求的深度，因此浅层仓库不会因深层同级消耗掉配额而丢失。任一种类的 `.git` 条目都标记一个仓库——子模块与链接工作区是以*文件*形式记录自己的，因此只检测目录恰好会漏掉本次扫描存在的意义所在：嵌套仓库。嵌套被保留而非剪除，内层仓库标记为 `submodule`。

依赖与构建目录（`node_modules`、`.venv`、`dist`、`target` 及同类）从不进入：每个都会带来无界遍历，而其中的仓库并非用户所写。不可读的目录被跳过，而不是让整次扫描失败。

## 推送前的比较

`compareBases` 用 `rev-list --left-right --count`（基线在左，因此左侧计数即 `behind`）读取偏离，并仅在基线确实前进时用 `merge-tree --write-tree` 询问冲突。后者在对象数据库中计算合并：不写入工作区文件，不移动 ref。

## Config

| 键 | 默认值 | 含义 |
|---|---|---|
| `cli` | `git` | 可执行文件名或绝对路径 |
| `readTimeoutMs` | `30000` | 一次 status、diff、log、发现或图谱读取 |
| `writeTimeoutMs` | `120000` | 一次 stage、unstage、discard 或 commit（钩子在此运行） |
| `maxOutputBytes` | `4000000` | 每次调用收集输出的上限 |
| `graceMs` | `5000` | 交给 subprocess seam 的终止宽限期 |
| `maxChanges` | `2000` | 一次 status 在截断前报告的改动路径数 |

配置错误在加载时失败。没有 `git` 的机器不会：可用性是 seam 在选择期间按调用探测的事实。

## Model Experience

间接地，经由 `dsh-tool-git`，它把本后端的回答转化为工具 schema、提示词指引与保留的工具结果 token。

#### KV Cache effect

无直接失效；具名的消费方负责任何请求前缀的变化。

## Known Limitations and Deferred Work

- **发现过程读取文件系统而非 `git`** —— `.git` 存在但已损坏的仓库会被发现并在首次使用时失败，这是诚实的顺序：用一个 `git` 进程探测每个候选目录会付出每目录一个进程的代价。
- **跳过列表是固定的** —— 从不进入的目录名是这些目录本身的性质，而非部署选择；需要不同名单的工作区目前没有对应配置。
- **`readTimeoutMs` 限制的是每次调用而非一次 status** —— 一次 status 运行三次调用（status 加 numstat 两侧），因此病态仓库最多可耗费读取超时的三倍。
