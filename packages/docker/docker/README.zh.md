# @deepseek-ai/dsh-docker

[English](README.md) | 中文

**`DockerRuntime`**（`ctx.docker`）定义 harness 具备哪些容器访问能力——查看容器与镜像、读取某个容器的日志、执行 Compose 项目生命周期——并通过多个后端实现，不把模型约定绑定到某个引擎的 API。

本包承担 Docker 能力 seam 的 Service Definition 角色：

| 包 | 职责 |
|---|---|
| `@deepseek-ai/dsh-docker`（本包） | Service Definition：服务、提供方注册表、选择策略、请求／结果词汇、`DockerError` 分类体系 |
| `@deepseek-ai/dsh-docker-local` | 提供方：通过 `ctx.subprocess` 驱动的本地 `docker` CLI |
| `@deepseek-ai/dsh-tool-docker` | Consumer：面向模型的 `docker_ps`／`docker_images`／`docker_logs`／`docker_compose_*` 工具 schema，构建于 `ctx.docker` 之上 |

容器查看、镜像列举、日志读取与 Compose 生命周期共用一个 seam，因为它们共享同一条引擎连接、同一次选择决策和同一套错误分类体系；它们的请求与结果类型保持独立。

## 服务 API（`ctx.docker`）

| 成员 | 语义 |
|---|---|
| `registerProvider(provider)` | 注册后端。id 重复时抛出 `DockerError` `DOCKER_PROVIDER_DUPLICATE`。返回 disposer；该注册随调用 fiber 一并拆除。 |
| `providerIds()` | 按注册顺序返回已注册 id，供诊断和提供方展示使用。选择绝不参考该顺序。 |
| `list(request?, signal?)` | 在所选后端上列出容器；`all` 包含非运行中的容器，`project` 按 Compose 项目标签限定范围。 |
| `images(signal?)` | 在所选后端上列出本地可用镜像。 |
| `logs(request, signal?)` | 读取某个容器的尾部日志文本。没有 follow 模式：流式订阅是另一种生命周期，有自己的取消与背压处理。 |
| `composeUp(request, signal?)` | 启动 Compose 项目并返回结算后的容器。 |
| `composeDown(request, signal?)` | 停止并删除 Compose 项目的容器。 |

提供方注册的是**后端**而非工具。`dsh-tool-docker` 是面向模型的名称、描述、提示词指引、JSON Schema 和呈现的唯一归属方。

## 选择

选择绝不依赖注册、配置或 HMR（热模块替换）顺序。部署要么固定一个提供方 id（配置 `provider`，或由 `$DSH_DOCKER_PROVIDER` 运维覆盖提供相同字段），要么让唯一可用提供方自动选择。每次调用都先解析提供方，并且每次都会重新探测可用性，因此两次调用之间停止的守护进程会在选择阶段失败，而不是在操作阶段失败：

| 情况 | 执行 |
|---|---|
| 已配置 id 已注册且 `available()` | 运行该提供方 |
| 已配置 id 未注册 | `DOCKER_PROVIDER_CONFIGURED_MISSING` |
| 已配置 id 已注册但不可用 | `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 无 id，恰好一个已注册的可用提供方 | 运行该提供方 |
| 无 id，没有可用提供方 | `DOCKER_PROVIDER_UNAVAILABLE` |
| 无 id，多个可用提供方 | `DOCKER_PROVIDER_AMBIGUOUS` |

每个失败分支都抛出 `DockerError`；直接调用方按其结构化 code（加消息细节：缺失 id、歧义候选集合）路由。提供方的 `available()` 回答其引擎当前能否访问；守护进程已停止的提供方会在选择阶段被跳过，而不是被选中后失败。`dsh-tool-docker` 永远不会调用它——工具通过 `ctx.docker` 执行，并按抛出的 code 路由，因此提供方选择只有一个归属方。

## 词汇

`DockerListRequest`（`all?`、`project?`）→ `DockerContainer[]`（`id`、`name`、`image`、`state`、`status`、可选 `project`／`service`、`ports[]`、`createdAt`）。`DockerContainerState` 是封闭联合（`created` | `running` | `paused` | `restarting` | `exited` | `dead`），消费方对其进行穷尽 switch；后端报告集合之外的状态时会映射到最接近的成员，而非扩展该联合。`DockerLogsRequest`（`container`、`tail?`、`since?`）→ `DockerLogsResult`（`container`、`content`、`truncated`），其中 `content` 按最早在前的顺序交错容器的 stdout 与 stderr。`DockerComposeRequest`（`file`、`project?`、`services?`）→ `DockerComposeResult`（`project`、受限的 `output`、结算后的 `containers[]`）；相对 `file` 相对提供方配置的项目根目录解析。取消作为可选的直接 `AbortSignal` 参数传给每项操作。完整约定与 `DockerError` code 分类体系见 `src/types.ts`。

`DockerError` 携带开放字符串 `code`，因此消费方要容忍提供方特有的取值：seam 抛出上述五个选择与注册 code，提供方另外补充引擎层 code，例如 `DOCKER_ENGINE_FAILED`、`DOCKER_NOT_FOUND` 和 `DOCKER_INVALID_REQUEST`。

## 模型体验

通过 `dsh-tool-docker` 间接影响；该工具渲染有界的容器、镜像、日志与 Compose 数据，或把结构化 `DockerError` code 保留为工具错误；本注册表自身不贡献提示词或 schema。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与暂缓事项

- **没有 follow 模式，也没有观测接口**：`logs()` 只返回一批有界内容；没有提供方变更事件或能力状态查询，可用性只能通过执行操作并按抛出的 `DockerError` code 路由来观测。
- **`composeDown` 忽略 `services`**：`DockerComposeRequest` 携带该字段是为了 `composeUp`，但拆除会整体删除项目的容器，因此后端不会按服务过滤 `down`（见 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-08-21-docker-capability-seam.md)）。
- **seam 没有单容器生命周期**：没有 start、stop、restart、exec、pull 或 prune；容器生命周期暂缓，由模型已经能够推理的 Compose 项目级操作承担。
- **`DockerImage.size` 的精度取决于后端上报的内容**：seam 声明单位为字节，而不公开机器可读尺寸的后端只能上报由自身展示字符串推导出的数值。
