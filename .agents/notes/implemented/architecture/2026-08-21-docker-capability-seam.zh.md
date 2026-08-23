# Agent Note: 基于本地 CLI 的 Docker 能力 seam

Status: implemented

[English](2026-08-21-docker-capability-seam.md) | 中文

## 问题

开发机上的 agent（智能体）工作经常涉及容器：任务依赖的服务已经停止，集成测试前需要先启动 Compose 项目，某个失败只能通过某个容器的日志尾部来解释。没有容器能力时，模型只能通过 `bash` 获取这些事实——每次调用都是非结构化命令，输出需要模型自行解析，参数无法由 harness 限制，结果在 UI 中也只能渲染为终端文本。

容器、镜像、日志与 Compose 项目通过同一条连接访问同一个引擎，且在引擎不可达时以完全相同的方式失败。把它们放进各自的服务会重复同一次选择决策和同一套错误分类体系；把它们直接放进工具包，则会让面向模型的 schema 同时承担引擎访问、参数映射、输出解析与提供方选择。

浏览器客户端也希望展示正在运行的内容。该界面属于读取操作，但如果 Docker 域公开生命周期操作，一个按钮就能改变机器状态，而没有任何 session 记录说明是谁改的、为什么改。

## 决策

容器访问是一个能力 seam，遵循[能力 seam Agent Note](2026-06-13-capability-seams.md)：

1. `@deepseek-ai/dsh-docker`（`packages/docker/docker`）拥有 `ctx.docker`、提供方注册表、提供方选择、共享请求／结果词汇以及 `DockerError`。
2. `@deepseek-ai/dsh-docker-local`（`packages/docker/docker-local`）通过 `ctx.subprocess` 驱动本地 `docker` CLI 实现后端，并将其注册到 `ctx.docker`。
3. `@deepseek-ai/dsh-tool-docker`（`packages/docker/tool-docker`）在 `ctx.docker` 之上拥有面向模型的 `docker_ps`、`docker_images`、`docker_logs`、`docker_compose_up` 与 `docker_compose_down` schema、参数校验、提示词区段、输出上限、结果格式与呈现。

选择规则与 [web seam](2026-06-24-web-capability-seam.md) 一致，且绝不依赖注册顺序：已配置的提供方 id 必须已注册且可用，否则恰好一个可用提供方自动选择；没有可用提供方为 `DOCKER_PROVIDER_UNAVAILABLE`，存在多个为 `DOCKER_PROVIDER_AMBIGUOUS`。可用性在每次调用时重新探测而不缓存，因为 Docker 守护进程会在一次普通会话期间启动和停止，缓存的「可用」结论会把操作发往一个已经消失的后端。该探测是一次 `docker info` 调用，其代价与它前置的那次操作处于同一量级。

容器查看、镜像列举、日志读取与 Compose 生命周期共用一个 seam，因为它们共享引擎连接、选择决策与错误分类体系；它们的请求与结果类型保持独立，且 `DockerContainerState` 是消费方进行穷尽 switch 的封闭联合。

### 后端选择本地 CLI

`docker-local` 通过 `ctx.subprocess` 以固定 argv（而非 shell 字符串）执行 `docker`，并解析 `--format json` 输出。有两项事实使 CLI 胜过 Engine API socket。

Compose 是仅 CLI 具备的能力。在裸 HTTP API 之上重新实现项目编排，意味着重新实现依赖顺序、网络与卷创建、健康检查等待以及拆除逻辑——重复实现那个已经拥有这些能力的组件，并在 Compose 的每次发布中与其产生分歧。

CLI 不需要任何桌面应用。它与自身环境所指向的引擎通信，因此运行 Docker Engine、Colima、OrbStack 或 Rancher Desktop 的机器由同一个提供方服务，harness 无需为它们建模。`available()` 运行 `docker info` 而非 `docker version`，因为仅客户端的 `version` 在守护进程停止时仍会成功。

解析器容忍 CLI 实际输出的内容：不是 JSON 对象的 stdout 行属于纯文本警告（context 弃用、凭据助手提示），会被跳过而不使列举作废；封闭联合之外的引擎状态词读作 `dead`，而非扩展该联合。`docker images --format json` 不公开机器可读尺寸，因此提供方把展示字符串（`1.09GB`）解析为十进制字节，无法解析时报告 `0`；仅用于展示的字段不得使列举失败。

### 浏览器 Docker 域是只读的

`packages/host/apiproxy/src/api/docker.ts` 只声明 `listContainers`、`listImages` 与 `logs`。生命周期被有意排除在外：**模型可见 ⟺ 已记录**，而从 UI 按钮启动或停止容器会改变机器状态，却没有任何 session 事件记录它。把生命周期路由到 agent 的工具，可以让每一次此类变更都能从 session 日志中以带参数与结果的 `tool/call` 重建。当组合未挂载 Docker seam 或没有后端能访问引擎时，该域返回 `docker-unavailable`，客户端将其展示为空状态而非错误。

### 只读工具默认启用，Compose 工具需显式开启

`tool-docker` 独立注册两组工具：`inspect` 默认为 true，`compose` 默认为 false，已发布的 `packages/bundle/base/cordis.patch.yml` 显式声明二者。读取只做观察，不会损坏机器，其价值也不取决于部署的取向。Compose 工具会改变部署所拥有主机的状态，因此启用它属于部署决策而非默认行为。每组各自贡献提示词区段，因此只读组合绝不会向模型提及它并不具备的工具。

注册遵循启用状态而非可用性。已启用的工具在没有注册后端或守护进程停止时仍然可见，执行以结构化 `DockerError` 失败，因此插件加载顺序、引擎状态与 HMR（热模块替换）时序绝不会进入面向模型的 schema。因此在没有 Docker 的机器上注册 seam 与本地提供方不产生任何代价。

## 曾考虑的替代方案

**让模型用 `bash` 操作 Docker。** 已拒绝。模型将解析无界的 CLI 文本，harness 无法限制日志或 Compose 输出，参数会被 shell 解释，UI 也只能把结果渲染为终端卡片。这些工具还允许部署只提供读取而不提供生命周期，这是 shell 工具无法表达的。

**驱动 Engine API socket 而非 CLI。** 很有吸引力，因为它提供结构化 JSON 与真实字节尺寸，也不需要 PATH 上有 `docker` 可执行文件。已拒绝，因为 Compose 不在该 API 中：模型最需要的项目生命周期将不得不针对 `docker compose` 自身的语义重新实现。代价是需要解析 CLI 文本，并失去精确的镜像尺寸。

**拆分为 `ctx.containers` 与 `ctx.compose` 两个 seam。** 已拒绝，理由与 web seam 保留搜索和抓取在一起相同：提供方注册表、与顺序无关的选择、中止传播与错误分类体系都是共享机制，拆分会在两个近乎相同的 seam 中重复实现，而部署也要为一个引擎配置两处。

**缓存提供方可用性。** 已拒绝。Docker 守护进程会在会话期间停止和启动，缓存结论会把操作路由到已经不可达的后端，把一次干净的选择错误变成操作中途的引擎失败。

**在 seam 上公开容器生命周期（start、stop、restart、exec、pull）。** 暂缓而非拒绝。Compose 项目级操作已覆盖模型当前会推理的场景；单容器动词是更大的面向模型约定，还带来自身的权限问题，日后新增属于增量变更。

**在浏览器 RPC 域中公开生命周期。** 已拒绝。未记录的按钮改变机器状态会破坏 session 日志所保证的可重建性，而同一操作已经以已记录的工具调用形式存在。

**默认启用 Compose 工具。** 已拒绝。`docker compose down` 会删除用户机器上某个项目的容器；未经部署明示就能执行该操作的默认值处于安全默认界线的错误一侧。

## 测试

每一层都在自己的边界上被固定。`dsh-docker` 覆盖注册、随注册 fiber 的释放、包括逐次调用重新探测在内的每个选择分支，以及连同取消信号的转发。`docker-local` 在脚本化的 `ctx.subprocess` 之上覆盖 CLI 参数构造（日志的 `--` 终止符、项目过滤条件、已配置的项目根目录）、含交错警告的 JSON 行解析、未知状态词、镜像 id 合并、来自 `docker info` 的可用性、not-found 与引擎失败的分类，以及 `down` 不带服务过滤条件。`tool-docker` 通过真实工具注册表与真实 `ctx.docker` 覆盖按组注册、加载时配置校验、释放、并发安全声明、格式化、输出上限、参数校验，以及结构化引擎错误抵达模型而工具保持注册。

## 后果

**镜像尺寸是近似值。** 它们来自 CLI 以十进制单位四舍五入后的展示字符串；需要精确字节的调用方无法从该后端获得。

**`composeDown` 忽略 `services`。** `DockerComposeRequest` 携带该字段是为了 `composeUp`，但 CLI 的 `down` 会整体删除项目，因此提供方与 `docker_compose_down` schema 都丢弃它。

**列举没有上限。** 日志与 Compose 输出受限，但拥有数百个容器或镜像的主机会把每一行渲染进模型上下文；需要限制的部署应按项目收窄范围或禁用只读组。

**没有 Docker 专属权限策略。** 包括会改变状态的那对工具在内，每个工具执行时都不使用 `ctx.approval`；需要确认的部署应添加 `tools/pre-execute` 策略。

**远程引擎由 CLI 负责。** 该提供方不为主机、TLS 材料或 context 选择建模，因此访问远程引擎需要配置 CLI 的环境，而非配置插件。
