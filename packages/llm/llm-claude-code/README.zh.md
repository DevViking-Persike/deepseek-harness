# @deepseek-ai/dsh-llm-claude-code

[English](README.md)

Claude 订阅的 DeepSeek Harness LLM 接口适配器：以 Claude Code 客户端身份、通过操作者自己的 Claude 订阅 OAuth token 直连 Anthropic 的 `/v1/messages` 端点 —— 即 Claude Code CLI 注册的同一公开 OAuth 协议，而非公开 API-key API。

注册 `claude-code-oauth` provider 路由（默认目录：`claude-fable-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8`、`claude-sonnet-4-6`、`claude-haiku-4-5-20251001`）。Harness 模型名即线上模型名；请求不限于目录。

### 目录容量

每个默认值都是该端点为此订阅实际提供的容量，取自指明上限的拒绝响应，而非照抄厂商注册表。

| 模型 | 上下文窗口 | 输出上限 |
| --- | ---: | ---: |
| `claude-fable-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8` | 1,000,000 | 128,000 |
| `claude-sonnet-4-6` | 200,000 | 128,000 |
| `claude-haiku-4-5-20251001` | 200,000 | 64,000 |

这四个模型原生提供 1M 窗口：在不带 `context-1m-2025-08-07` beta 时，请求路径即返回 `prompt is too long: N tokens > 1000000 maximum`，加上该 beta 也不改变结果。因此适配器从不发送它 —— 没有原生 1M 窗口的模型会直接拒绝该 beta（`The long context beta is not yet available for this subscription`），哪怕同一请求在不带它时可以成功。

`claude-sonnet-4-6` 虽然确实能接受更大的输入，但仍按 200,000 登记：输入超过约 220,000 token 后端点会返回 `Usage credits are required for long context requests`，因此其仅凭订阅可依赖的容量就是此处记录的 200,000。

## 连接订阅

两条路径，最终落入同一持久化凭据（`$DSH_HOME/claude-code-oauth.json`，仅所有者可读）：

- **导入（一次性）**：将 `importFrom` 指向 CLIProxyAPI 的 Claude 授权文件（如 `~/.cli-proxy-api/claude-<email>.json`）；服务在首次启动时播种自己的存储，此后不再读取该文件。
- **浏览器登录**：打开 `http://127.0.0.1:<controlPort>/start`（默认端口 1458）完成 Anthropic OAuth PKCE 流程；本地回调完成交换。`/status` 与带 CSRF 保护的 `/logout` 构成完整的控制端点。

访问 token 在临近过期时（五分钟余量）对 `platform.claude.com/v1/oauth/token` 静默刷新。

## 配置

以 `llm-claude-code` 挂载于 `dsh-base`。在 `cordis.yml` 中所有字段均可省略：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiBase` | `https://api.anthropic.com` | Anthropic API 基址；追加 `/v1/messages` |
| `authorizeUrl` / `tokenUrl` | `claude.ai/oauth/authorize` / `platform.claude.com/v1/oauth/token` | OAuth 端点覆盖 |
| `controlPort` | `1458` | 登录控制服务器的回环端口 |
| `path` | `$DSH_HOME/claude-code-oauth.json` | 凭据文档路径 |
| `importFrom` | 未设置 | 待一次性导入的 CLIProxyAPI Claude 授权文件 |
| `models` | 见上 | 目录模型列表 |
| `maxTokens` | `32000` | 默认单请求输出上限；显式请求值与模型级 `maxTokens` 优先 |
| `defaultContextWindow` | `200000` | 所选模型无精确值时使用的上下文容量 |
| `streamIdleTimeoutMs` | `300000` | 单次流读取未完成时提供方的最大空闲时间 |
| `retryPolicy` | normal 模式、五次重试 | 提供方模型请求重试策略 |

`llm-claude-code:` 用户设置段（`$DSH_HOME/settings.yaml`）覆盖本条目，无需重启。

## Model Experience

### Claude 请求

#### 模型所见

所选 Claude 模型收到 harness 系统提示（与 system 角色历史合并进顶层 `system` 槽）、消息历史、工具 schema、停止序列与调用配置，不含适配器自拟的提示文本。Harness 推理块不回传：Anthropic 多轮思考需要提供方原始签名的 thinking 块，未签名的替代品会被上游拒绝。

#### Token 效应

Anthropic 分词决定精确输入。推理不回传意味着后续请求不重新携带先前的思维链 token；提供方上报时报告缓存读取用量。

#### KV 缓存效应

未变的组装前缀在订阅 OAuth 缓存范围（`prompt-caching-scope`）内可获 Anthropic 提示缓存复用；更改模型或任何提示、schema、历史内容可能从首个变化 token 起阻止复用。

### Claude 响应

#### 模型所见

文本、思考与原始字符串工具参数被翻译为 harness chunk，由循环记录并组装。

#### Token 效应

生成的 token 遵循请求的 `maxTokens`（默认 32000）；仅循环保留的块影响后续输入。

#### KV 缓存效应

循环保留的响应块追加到下一请求并保留其前部可复用前缀；被丢弃的块无后续缓存效应。更改模型会选择不同的缓存域。

## Known Limitations and Deferred Work

- **图像输入被拒绝（`UNSUPPORTED_CONTENT`）** —— 适配器只发送文本与工具块；需要多模态输入时按 `llm-deepseek` 的 data-URL 模式扩展。
- **推理是单向的** —— thinking 块流式送达 harness，但不在后续轮次回传（未签名思考会被上游拒绝）；无损回传需要 `replayState` 投影。
- **无推理力度选择器** —— 力度协商需映射到 `effort` beta 与思考预算；推迟到 harness 表面需要时再做。
- **设置中的模型列表整体替换组合列表** —— 设置层合并按字段进行，数组是单字段。
- **请求使用原生 `fetch` 而非共享 HTTP 服务** —— 无共享代理/拦截配置；推迟到第二个适配器需要时再引入。
- **控制服务器是回环明文 HTTP** —— 用于登录/轮换的 Web 设置卡推迟。
