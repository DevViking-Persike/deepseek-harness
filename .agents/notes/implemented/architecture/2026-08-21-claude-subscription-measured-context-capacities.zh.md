# Agent Note: 目录记录端点实际提供的 Claude 上下文容量，而非注册表宣称的容量

Status: implemented

[English](2026-08-21-claude-subscription-measured-context-capacities.md) | 中文

## Problem

`llm-claude-code` 仅为 `claude-fable-5` 显式登记了 1M 窗口；`claude-opus-5`、`claude-sonnet-5` 与 `claude-opus-4-8` 没有精确值，只能回落到 `defaultContextWindow`（200,000）。压缩逻辑读取的正是这个数字，因此这三个模型在端点所授予容量的五分之一处就被压缩，浪费了订阅已付费的大部分上下文。

看似显然的修法 —— 从 CLIProxyAPI 模型注册表照抄 `context_length` —— 并不构成证据。注册表陈述的是某个模型在某处能做到什么，而目录治理的是本凭据可以向本端点发送什么，二者随订阅而分化。此前一次相反方向的尝试已经失败：一个携带 `context-1m-2025-08-07` 的原始请求被拒绝，返回 "The long context beta is not yet available for this subscription"，读起来就像是在证明该订阅根本没有 1M 权益。

## Decision

目录值通过 OAuth 路径逐模型实测于 `api.anthropic.com`，且 Anthropic 会在自己的拒绝响应中指明各项上限：`prompt is too long: N tokens > LIMIT maximum` 指明窗口，`max_tokens: N > CAP` 指明输出上限。两者都是校验失败，因此刻意超量的探测可以读出真实上限而不产生任何 token。

| 模型 | 上下文窗口 | 输出上限 |
| --- | ---: | ---: |
| `claude-fable-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8` | 1,000,000 | 128,000 |
| `claude-sonnet-4-6` | 200,000 | 128,000 |
| `claude-haiku-4-5-20251001` | 200,000 | 64,000 |

这四个模型的 1M 窗口是原生的，而非选择性开启：在不带 `context-1m-2025-08-07` 时它们各自返回 `> 1000000 maximum`，加上该 beta 也不改变任何结果。因此适配器继续不发送它。该 beta 不只是无用，在别处还有害 —— `claude-haiku-4-5-20251001` 能回应普通的 200k 请求，但同一请求一旦携带该 beta 就会被拒绝；这正是此前那次失败的成因：它测量的是 beta 的可用性，而非模型的容量。

`claude-sonnet-4-6` 明显能提供更多，却仍按 200,000 回落值登记。它在 208k 与 220k 输入下均成功响应，而在 240k 及以上返回 `Usage credits are required for long context requests`。该上限依赖按量付费额度而非订阅本身，因此目录记录每个请求都可依赖的容量。其输出上限仍据实测修正为 128,000，而非注册表所载的 64,000。

## Alternatives considered

**整体采用 CLIProxyAPI 注册表的取值。** 它在那四个 1M 窗口上与实测一致，但其性质是愿景而非权益：它同时把 `claude-sonnet-4-6` 声明为 200,000/64,000，而端点实际提供 128,000 的输出上限，以及 200,000 以上受额度限制的窗口。其自身源码亦可佐证它从不在线上主张 1M 窗口 —— `claudeCodeCLIBetas` 仅在调用方明确请求时才转发 `context-1m-2025-08-07`。

**发送 `context-1m-2025-08-07` 以解锁窗口。** 它什么也解锁不了，因为窗口本就是原生的；而在所有不具备该窗口的模型上，它会把本可成功的请求变成失败。

**按实测上限登记 `claude-sonnet-4-6`。** 那样压缩会按一份随额度余额消失的容量来规划提示词长度，把一个规划数字变成间歇性的请求失败。

## Consequences

压缩为 `claude-opus-5`、`claude-sonnet-5` 与 `claude-opus-4-8` 按端点实际提供的 1M 窗口规划，而不再按 200,000 的回落值。

真实组合测试经由 `ctx.llm.resolveModelInfo` 解析全部六个模型并固定各自窗口，因此一旦恢复为照抄注册表的取值即会测试失败；该测试同时断言任何请求都不携带 `context-1m`。由于这些数字属于权益而非常量，订阅变更可以合理地改变它们，届时重新推导它们的依据是本 Note 记录的测量方法，而非注册表。
