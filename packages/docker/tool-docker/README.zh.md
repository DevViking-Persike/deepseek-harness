# @deepseek-ai/dsh-tool-docker

[English](README.md) | 中文

面向模型的 Docker 工具套件 `docker_ps`、`docker_images`、`docker_logs`、`docker_compose_up` 与 `docker_compose_down`，构建于 [Docker 能力 seam](../docker/README.md)（`ctx.docker`）之上。它只负责面向模型的事项：工具名称、JSON Schema、参数校验、提示词区段、输出字符上限、结果格式，以及 UI 呈现投影——只读工具使用 `card: 'generic'` 调用视图，Compose 生命周期使用 `card: 'terminal'` 调用与结果视图。所有引擎访问都通过 `ctx.docker`；该包绝不导入具体提供方。所有工具都不公开面向模型的超时：每个工具的协作式工具调用预算通过配置在此声明（`inspectTimeoutMs`／`composeTimeoutMs`，附加为 `ToolDefinition.timeoutMs`），由 [`@deepseek-ai/dsh-tool-call-timeout-policy`](../../guard/timeout-policy/README.md) 强制执行。

两组工具独立注册。只读组默认启用，Compose 组默认不启用，因为启动和停止容器会改变机器状态，而只读的 Docker 视图本身已经有用。每组各自贡献一个提示词区段，因此只启用只读工具的组合绝不会向模型提及生命周期工具。

## 工具

| 工具 | 参数 | 行为 |
|---|---|---|
| `docker_ps` | `all`（boolean）、`project`（string） | 列出容器；除非 `all` 为 true，否则只列出运行中的容器，可按单个 Compose 项目限定范围。缺省参数会从 seam 请求中省略，而不是以显式 `undefined` 发送。 |
| `docker_images` | 无 | 列出本地可用镜像。同一镜像 id 的重复行在抵达时已合并为一条携带全部 tag 的条目。 |
| `docker_logs` | `container`（必填 string）、`tail`（number）、`since`（string） | 读取某个容器的尾部日志文本。输出以 `maxLogChars` 为上限，保留最新字符。 |
| `docker_compose_up` | `file`（必填 string）、`project`（string）、`services`（string[]） | 启动 Compose 项目并等待其容器就绪。重复的服务名按首次出现顺序合并。 |
| `docker_compose_down` | `file`（必填 string）、`project`（string） | 停止并删除 Compose 项目的容器。 |

三个只读工具选择并发调度，因为它们不会修改父 agent（智能体）的状态。两个 Compose 工具都声明为并发不安全：Compose 会改变机器状态，对同一项目的并发生命周期调用会在引擎内部产生竞争。

每个工具的 JSON 输出值都是 seam 结果的结构化投影——普通可变 JSON 行，容器的每个缺省可选字段都会省略——模型读到的文本由该值渲染，因此 UI 呈现与将来的适配器绝不需要抓取渲染文本。

## 配置

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `inspect` | `true` | 注册 `docker_ps`、`docker_images` 与 `docker_logs`。 |
| `compose` | `false` | 注册 `docker_compose_up` 与 `docker_compose_down`。启动与停止容器是部署决策，因此需要显式选择启用。 |
| `inspectTimeoutMs` | `30000` | 单次只读调用的协作式工具调用超时预算（ms）。 |
| `composeTimeoutMs` | `600000` | 单次 Compose 生命周期调用的协作式工具调用超时预算（ms）。 |
| `maxLogChars` | `40000` | 单次 `docker_logs` 调用输出的字符上限；配置值会原样出现在工具描述中。 |
| `maxComposeOutputChars` | `40000` | 单次 Compose 调用输出的后端文本字符上限。 |

每个数值字段都必须是正整数；无效值会在加载时抛出，而不是在首次调用时才失败。两个上限都保留最新字符，因为日志尾部与 Compose 进度尾部才是解释刚刚发生的失败的内容。

```yaml
- id: tool-docker
  name: '@deepseek-ai/dsh-tool-docker'
  config:
    inspect: true
    compose: false
```

## 稳定注册

工具注册遵循产品**启用状态**，而非后端可用性。已启用的工具在没有注册提供方、已配置提供方缺失、存在多个可用提供方或守护进程停止时仍然可见；seam 在执行时解析提供方，执行以结构化 `DockerError`（`DOCKER_PROVIDER_UNAVAILABLE`、`DOCKER_PROVIDER_AMBIGUOUS` 及分类体系中的其余 code）失败，`ToolRuntime.execute()` 会把它转换为模型可读、hook／UI 可路由的错误工具结果。因此在没有 Docker 的机器上注册 Docker seam 与后端不产生任何代价。要彻底移除某个 Docker 工具，在此通过配置禁用其所在组。

该工具永远不会调用提供方的 `available()`，也不会枚举提供方——它唯一的执行路径是 `ctx.docker`，因此提供方选择完全留在 seam 内部。

## 模型体验

### 系统提示词

#### 模型看到什么

每个启用的组贡献一个区段：只读组的 order 为 112，Compose 组为 113。作用域内的工具限制不会移除这些独立注册的区段。

##### 只读 Docker 指引

```markdown
Use docker_ps to see which containers exist and whether they are running, docker_images to see locally available images, and docker_logs to read a container's recent output when diagnosing a failure. These tools only observe; they never start or stop anything.
```

##### Compose 生命周期指引

```markdown
Use docker_compose_up to start a Compose project and docker_compose_down to stop and remove its containers. These tools change machine state: name the compose file the user asked about, and confirm with docker_ps rather than assuming the result.
```

#### Token 影响

每个通过配置启用的组在每次请求中都产生固定的指引开销，即使限制隐藏了它的 schema 也是如此。启用 Compose 会新增其区段；禁用只读组会移除其区段。

#### KV Cache 影响

在启用的组、作用域与指引文本不变时保持前缀稳定。配置启用状态或插件生命周期可能使复用从第一个变化的提示词区段起失效；作用域内的 schema 限制不会移除它。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`docker_ps`、`docker_images`、`docker_logs`、`docker_compose_up` 与 `docker_compose_down` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-docker)。`docker_logs` 的描述会陈述已配置的 `maxLogChars`。除此之外，超时预算与输出上限都是部署设置，不是模型参数。

#### Token 影响

在已解析的 `maxLogChars` 下，已启用的组在每次请求中产生固定的 schema 开销；配置禁用会同时移除 schema 与指引，而作用域限制只移除 schema。

#### KV Cache 影响

在定义、已解析的日志上限与可见性不变时保持前缀稳定。配置启用状态、修改 `maxLogChars`、插件生命周期或作用域限制可能使复用从第一个变化的 schema token 起失效。

### 容器与镜像列举

#### 模型看到什么

`docker_ps` 为每个容器渲染一行，形如 `<name>[ [<project>/<service>]] <state> (<status>) image=<image>[ ports=<mapping> …]`；未打标签或未发布端口时省略 Compose 范围与端口后缀，空列举为 `No containers matched.`。`docker_images` 为每个镜像渲染一行，形如 `<tag> … <size> id=<id>`；未打 tag 的镜像读作 `<untagged>`，尺寸按 `docker images` 使用的单位渲染，空列举为 `No images found.`。

#### Token 影响

取决于数据，与主机上的容器或镜像数量成正比；两种列举都不设上限，两种结果在压缩前都会重复发送。

#### KV Cache 影响

仅追加；新增的可见内容位于可复用请求前缀之后，不会使既有 KV Cache 条目失效。

### 日志读取

#### 模型看到什么

日志读取按最早在前的顺序返回容器交错的 stdout 与 stderr，限制为最新的 `maxLogChars` 个字符。空范围返回的文本正是 `The container produced no log output in this range.`。被提供方或上限截断的结果会在单独一行前缀 `(older entries dropped)`。

#### Token 影响

每次调用以 `maxLogChars` 为界，且在压缩前重复发送；`tail` 与 `since` 会收窄模型需要为之付费的范围。

#### KV Cache 影响

仅追加；新增的可见内容位于可复用请求前缀之后，不会使既有 KV Cache 条目失效。

### Compose 结果

#### 模型看到什么

结算后的 Compose 调用以 `Project <name> settled.` 开头——后端未报告项目名时为 `Project settled.`——随后为每个剩余容器渲染一行，形如 `- <name> <state>[ (<ports>)]`，拆除后无容器时为 `No containers remain.`。非空的后端输出在空行之后跟随，限制为最新的 `maxComposeOutputChars` 个字符。

#### Token 影响

取决于数据的项目状态，加上以 `maxComposeOutputChars` 为界的后端输出，在压缩前重复发送；Compose 组禁用时为零。

#### KV Cache 影响

仅追加；新增的可见内容位于可复用请求前缀之后，不会使既有 KV Cache 条目失效。

### 参数错误与引擎错误

#### 模型看到什么

取值错误恰好为 `Error: container must be a non-empty string`、`Error: tail must be a positive integer`、`Error: file must be a non-empty compose file path`、`Error: services must contain at least one service when provided` 或 `Error: each service must be a non-empty string`。后端不可达、缺失或存在歧义，以及引擎失败，都以 seam 或提供方的 `DockerError` 消息抵达模型，其结构化 code 位于错误元数据中。

#### Token 影响

只有失败的那次调用会增加这些被保留的 token。

#### KV Cache 影响

仅追加；新增的可见内容位于可复用请求前缀之后，不会使既有 KV Cache 条目失效。

## 已知限制与暂缓事项

- **`docker_compose_down` 不接受 `services`**：拆除会整体删除项目的容器，因此 schema 省略该字段，模型提供的任何取值都不会抵达 seam。
- **列举不设上限**：`maxLogChars` 与 `maxComposeOutputChars` 限制日志与 Compose 输出，但拥有数百个容器或镜像的主机会渲染每一行，因此需要限制的部署应按 `project` 收窄范围或禁用只读组。
- **没有 Docker 专属权限策略**：包括会改变状态的 Compose 工具在内，每个工具执行时都不请求 `ctx.approval`；需要确认的部署应添加 `tools/pre-execute` 策略。
- **没有单容器生命周期工具**：模型可以启动和停止 Compose 项目，但无法启动、停止、重启单个容器或进入其中执行命令，因为 [seam](../docker/README.md) 不公开此类操作。
