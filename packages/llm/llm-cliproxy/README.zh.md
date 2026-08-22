# @deepseek-ai/dsh-llm-cliproxy

[English](README.md)

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的 DeepSeek Harness LLM 接口适配器：一个本地代理实例通过 OpenAI 兼容的 `/v1/chat/completions` 端点暴露操作者自己的 CLI 订阅（Claude OAuth、Codex/OpenAI OAuth 等），本插件在其上注册两个 provider 路由：

- `cliproxy-claude` — Claude 模型（默认目录：`claude-fable-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8`、`claude-sonnet-4-6`、`claude-haiku-4-5-20251001`）
- `cliproxy-openai` — GPT/Codex 模型（默认目录：`gpt-5.6-sol`、`gpt-5.6-luna`、`gpt-5.6-terra`、`gpt-5.5`、`gpt-5.3-codex-spark`）

默认目录中的每个条目都带有自己的容量：Claude Fable 5、Opus 5、Sonnet 5 与 Opus 4.8 路由提供 1,000,000 token 上下文，Sonnet 4.6 与 Haiku 4.5 提供 200,000，所有 GPT/Codex 路由提供 400,000。目录之外的模型回退到 `defaultContextWindow`。

Harness 模型名即代理的线上模型名；请求不限于目录中的模型，代理可服务的任何模型（见其 `GET /v1/models`）均可按 id 选择。

## 配置

以 `llm-cliproxy` 挂载于 `dsh-base`。在 `cordis.yml` 中所有字段均可省略：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `http://127.0.0.1:8317/v1` | 代理端点基址，含 `/v1` 前缀 |
| `apiKeyEnv` | `CLIPROXY_API_KEY` | 凭据引用，每次请求经凭据服务解析；该服务缺席时取启动环境 |
| `claudeModels` / `openaiModels` | 见上 | 各路由的目录模型列表 |
| `maxTokens` | `32000` | 默认单请求输出上限；显式请求值与模型级 `maxTokens` 优先 |
| `defaultContextWindow` | `200000` | 所选模型无精确值时使用的上下文容量 |
| `streamIdleTimeoutMs` | `300000` | 单次流读取未完成时代理的最大空闲时间 |
| `retryPolicy` | normal 模式、五次重试 | 提供方模型请求重试策略 |

`llm-cliproxy:` 用户设置段（`$DSH_HOME/settings.yaml`，由 Web 模型页写入）覆盖本条目，无需重启。

代理 API key 是 CLIProxyAPI 操作者在其自身 `config.yaml` 的 `api-keys` 中设置的值 —— 它向本地代理认证，而非上游订阅。

## Model Experience

### CLIProxyAPI 请求

#### 模型所见

所选上游模型收到 harness 系统提示、消息历史、工具 schema、停止序列与调用配置，不含适配器自拟的提示文本。先前助手轮次的推理内容逐字传回，无论该轮是否调用了工具。

#### Token 效应

上游分词决定精确输入。推理传回将每个有推理轮次的思维链带入后续请求；代理在上游提供时报告用量并单列缓存读取 token。

#### KV 缓存效应

未变的组装前缀可经代理的会话亲和路由获得上游提供方的缓存复用；更改 provider 路由、模型或任何提示、schema、历史内容可能从首个变化 token 起阻止复用。推理传回在每个有推理的轮次追加。

### CLIProxyAPI 响应

#### 模型所见

推理、文本与原始字符串工具参数被翻译为 harness chunk，由循环记录并组装。

#### Token 效应

生成的 token 遵循请求的 `maxTokens`（默认 32000）；仅循环保留的块影响后续输入。

#### KV 缓存效应

循环保留的响应块追加到下一请求并保留其前部可复用前缀；被丢弃的块无后续缓存效应。更改 provider 路由或模型会选择不同的缓存域。

## Known Limitations and Deferred Work

- **图像输入被拒绝（`UNSUPPORTED_CONTENT`）** —— 适配器只发送字符串内容消息；需要多模态路由时按 `llm-deepseek` 的 data-URL 模式扩展。
- **无 `replayState`** —— 代理不暴露会话级原生元数据，跨提供方历史恢复依赖纯消息。
- **无推理力度选择器** —— 力度协商属于代理的上游路由，不属于本适配器。
- **设置中的模型列表整体替换组合列表** —— 设置层合并按字段进行，数组是单字段。
- **请求使用原生 `fetch` 而非共享 HTTP 服务** —— 无共享代理/拦截配置；推迟到第二个适配器需要时再引入。
