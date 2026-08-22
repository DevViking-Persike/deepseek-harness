# @deepseek-ai/dsh-llm-codex

[English](README.md)

Codex 订阅的 DeepSeek Harness LLM 接口适配器：以 Codex CLI 客户端身份、通过操作者自己的 Codex 订阅 OAuth token 直连 ChatGPT 后端 Codex Responses 端点（`chatgpt.com/backend-api/codex/responses`，`openai-beta: responses=experimental`）—— 即 Codex CLI 注册的同一公开 OAuth 协议，而非公开平台 API。

注册 `codex-oauth` provider 路由（默认目录：`gpt-5.6-sol`、`gpt-5.6-luna`、`gpt-5.6-terra`、`gpt-5.5`、`gpt-5.3-codex-spark`）。Harness 模型名即线上模型名；请求不限于目录。分层模型请求其服务层级：`gpt-5.6-luna` 发送 `service_tier: "priority"`（Luna Fast）。

## 连接订阅

两条路径，最终落入同一持久化凭据（`$DSH_HOME/codex-oauth.json`，仅所有者可读）：

- **导入（一次性）**：将 `importFrom` 指向 CLIProxyAPI 的 Codex 授权文件（如 `~/.cli-proxy-api/codex-*.json`）；服务在首次启动时播种自己的存储，此后不再读取该文件。
- **浏览器登录**：打开 `http://127.0.0.1:<controlPort>/start`（默认端口 1456）完成 OpenAI OAuth PKCE 流程；本地回调（端口 1455，公开客户端固定）完成交换。`/status` 报告登录状态与缓存的订阅用量（`wham/usage`）；带 CSRF 保护的 `/logout` 清除凭据。

访问 token 在临近过期时（五分钟余量）对 `auth.openai.com/oauth/token` 静默刷新。

## 配置

以 `llm-codex` 挂载于 `dsh-base`。在 `cordis.yml` 中所有字段均可省略：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `backendBase` | `https://chatgpt.com/backend-api` | 后端 API 基址；追加 `/codex/responses` |
| `usageUrl` | `…/backend-api/wham/usage` | 订阅用量端点 |
| `authorizeUrl` / `tokenUrl` | `auth.openai.com/oauth/…` | OAuth 端点覆盖 |
| `controlPort` | `1456` | 登录控制服务器的回环端口 |
| `path` | `$DSH_HOME/codex-oauth.json` | 凭据文档路径 |
| `importFrom` | 未设置 | 待一次性导入的 CLIProxyAPI Codex 授权文件 |
| `models` | 见上 | 目录模型列表；模型级 `serviceTier` 声明服务层级 |
| `defaultContextWindow` | `400000` | 所选模型无精确值时使用的上下文容量 |
| `streamIdleTimeoutMs` | `300000` | 单次流读取未完成时提供方的最大空闲时间 |
| `retryPolicy` | normal 模式、五次重试 | 提供方模型请求重试策略 |

`llm-codex:` 用户设置段（`$DSH_HOME/settings.yaml`）覆盖本条目，无需重启。

## Model Experience

### Codex 请求

#### 模型所见

所选 GPT 模型收到 harness 系统提示（与 system 角色历史合并进顶层 `instructions` 槽）、消息历史、工具 schema 与调用配置，不含适配器自拟的提示文本。Harness 推理块不回传：Codex 多轮思考连续性依赖提供方的 `encrypted_content`，harness 不保留它。

#### Token 效应

OpenAI 分词决定精确输入。推理不回传意味着后续请求不重新携带先前的思维链 token；后端上报时报告缓存读取用量。

#### KV 缓存效应

未变的组装前缀在订阅下可获后端提示缓存复用；更改模型或任何提示、schema、历史内容可能从首个变化 token 起阻止复用。

### Codex 响应

#### 模型所见

推理摘要、文本与原始字符串工具参数被翻译为 harness chunk，由循环记录并组装。

#### Token 效应

后端强制各模型自身的输出上限；单请求 `maxTokens` 不上线（端点拒绝 `max_output_tokens`）。仅循环保留的块影响后续输入。

#### KV 缓存效应

循环保留的响应块追加到下一请求并保留其前部可复用前缀；被丢弃的块无后续缓存效应。更改模型会选择不同的缓存域。

## Known Limitations and Deferred Work

- **输出上限归后端所有** —— 端点拒绝 `max_output_tokens`，单请求与配置的输出上限仅用于 `resolveModel` 能力视图；`maxTokens` 配置仅服务该视图，不上线。
- **推理是单向的** —— 推理摘要块流式送达 harness，但 `encrypted_content` 不保留、不回传；无损回传需要 `replayState` 投影。
- **图像输入被拒绝（`UNSUPPORTED_CONTENT`）** —— 适配器只发送文本与工具条目。
- **停止序列抛出 `UNSUPPORTED`** —— Responses 端点没有停止序列参数。
- **设置中的模型列表整体替换组合列表** —— 设置层合并按字段进行，数组是单字段。
- **请求使用原生 `fetch` 而非共享 HTTP 服务** —— 无共享代理/拦截配置；推迟到第二个适配器需要时再引入。
- **控制服务器是回环明文 HTTP** —— 用于登录/轮换的 Web 设置卡推迟。
