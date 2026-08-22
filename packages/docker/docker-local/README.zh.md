# @deepseek-ai/dsh-docker-local

[English](README.md) | 中文

用于 harness [Docker 能力 seam](../docker/README.md)（`ctx.docker`）的本地 `docker` CLI `DockerProvider`。它通过 `ctx.subprocess` 执行 CLI，列出容器与镜像、读取容器日志，并运行 Compose 项目生命周期。

这是一个**实现**包：它向 `ctx.docker` 注册提供方，不拥有该键，也不注册面向模型的工具。它是函数／命名空间插件（`inject: ['docker', 'subprocess']`）。

选择 CLI 而非 Engine API socket 作为后端，是因为 Compose 是仅 CLI 具备的能力：在裸 HTTP 之上重新实现项目编排，会重复实现那个已经拥有依赖顺序、网络创建和拆除逻辑的组件。

## 职责拆分

提供方拥有**引擎访问**：CLI 调用、参数构造、输出解析、单次调用超时、字节上限与 `DockerError` 分类。`@deepseek-ai/dsh-tool-docker` 拥有**呈现**——面向模型的 schema、参数校验、输出字符上限与渲染。提供方选择留在 seam 中。

每项操作都是一次短暂且不经 shell 解释的 `docker` 调用：参数以固定 argv 形式抵达可执行文件，因此容器名或 compose 路径绝不会被解释为 flag 或 shell 片段。日志读取会在 `--` 终止符之后传入容器名，因此以短横线开头的名称会作为操作数抵达 CLI。

`available()` 运行 `docker info`——守护进程停止时会失败的最廉价调用，因为仅客户端的 `version` 在引擎不可达时仍会成功——并返回 false 而非抛出异常，因此不可达的守护进程是一项选择事实，由 seam 转换为自身的错误。该提供方无需运行任何 Docker 桌面应用即可工作；唯一要求是守护进程可达。

## 失败分类

CLI 对任何失败都以非零码退出，因此提供方读取其消息：指明对象缺失的文本（`No such`、`not found`、`no configuration file`）归为 `DOCKER_NOT_FOUND`，其他非零退出归为 `DOCKER_ENGINE_FAILED`。可执行文件启动失败与调用超时同样归为 `DOCKER_ENGINE_FAILED`。非正的日志 `tail` 与空的 compose 文件路径会在任何进程启动前以 `DOCKER_INVALID_REQUEST` 拒绝。

## 解析

列举操作使用 `--format json`，并跳过不是 JSON 对象的 stdout 行：`docker` 会把 context 弃用与凭据助手提示等纯文本警告与数据行交错输出，而警告不得使原本有效的列举结果作废。Compose 项目名与服务名从 `Labels` 列的 `com.docker.compose.project` 与 `com.docker.compose.service` 标签读取。`DockerContainerState` 之外的引擎状态词读作 `dead`，而非扩展 seam 的封闭联合。镜像行会为每个 `repository:tag` 重复同一 id，因此提供方将它们合并为一条携带全部 tag 的镜像；`<none>` 的 repository 与 tag 值产生未打 tag 的镜像。

`composeUp` 运行 `up --detach --wait`，因此调用在容器运行或健康时才结算，而不是在 CLI 的 detach 确认时结算，返回的容器即真实结算状态。`composeDown` 运行 `down`，不带服务过滤条件。

## 配置

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `cli` | `docker` | Docker CLI 的可执行文件名或绝对路径。 |
| `projectRoot` | harness 进程 cwd | 调用的工作目录，也是相对 compose 路径解析所依据的根目录。 |
| `inspectTimeoutMs` | `30_000` | 单次查看类调用（`available`、`list`、`images`、`logs`）的协作式超时。 |
| `composeTimeoutMs` | `600_000` | 单次 Compose 生命周期调用的协作式超时；拉取镜像与等待健康检查通常比查看类调用长一个数量级。 |
| `maxOutputBytes` | `2_000_000` | 单次调用收集输出的字节上限；触及该上限的日志读取会报告 `truncated`。 |
| `graceMs` | `5_000` | 交给 subprocess seam 的终止宽限期。 |
| `defaultLogTail` | `200` | 请求未声明 `tail` 时使用的尾部日志行数。 |

每个数值字段都必须是正整数，且 `cli` 不得为空；无效值会在加载时抛出，不会静默构造限制荒谬的提供方。守护进程不可达不会导致加载失败，因为可用性是 seam 在选择期间逐次调用探测的事实。

```yaml
- id: docker-local
  name: '@deepseek-ai/dsh-docker-local'
```

## 模型体验

通过 [`dsh-tool-docker`](../tool-docker/README.md) 间接影响；该工具在自身字符上限下渲染此提供方解析出的容器、镜像、日志与 Compose 输出，并保留提供方失败；CLI 参数、警告行与进程机制保持隐藏。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与暂缓事项

- **镜像尺寸来自 CLI 的展示字符串**：`docker images --format json` 不公开机器可读尺寸，因此 `1.09GB` 之类文本按十进制（而非二进制）单位解析为字节，无法解析的取值读作 `0`，而不会使列举失败。
- **该提供方只驱动本地 CLI**：它自身没有远程引擎主机、TLS 连接或 `DOCKER_HOST` context 选择；由 CLI 自身的环境决定它访问哪个引擎。
- **`composeDown` 绝不按服务过滤**：CLI 的 `down` 会整体删除项目的容器并拒绝服务过滤条件，因此 seam 的 `services` 选择无法抵达它。
- **日志读取只有批量模式**：绝不传入 `--follow`，因此调用方每次只能得到一段有界尾部，窗口溢出时 `maxOutputBytes` 会丢弃最早的字节。
