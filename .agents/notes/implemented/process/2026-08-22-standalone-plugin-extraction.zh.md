# Agent Note：从 monorepo 中提取独立插件

Status: implemented

[English](2026-08-22-standalone-plugin-extraction.md) | 中文

## 问题

在 monorepo 内编写的功能包无法被外部用户安装：它们引入的 workspace 依赖（`workspace:^`）在其他地方无法解析，发布出去的副本会在 `pnpm install` 的第一行就失败。此处构建的四个功能——Docker 工具、Monaco 资源路由、CLIProxyAPI 适配器、两个订阅 OAuth 适配器——需要触达外部用户。

## 决策

将每个功能提取为独立的 CommonJS 插件：纯 JavaScript、无构建步骤、不引入任何 `@deepseek-ai/dsh-*` 包，全部能力在运行时通过 `ctx` 读取。三条事实使其成立，每一条都由实验而非假设确立：

**注册表校验的是元数据，不是类身份。** `ctx.llm.registerAdapter(providers, adapter)` 从不检查 `instanceof LlmAdapter`。提供 `providerInfo`（其 `.id` 必须等于所请求的 provider，`.name` 非空）、`providerRetryPolicy`、`listModels`、`resolveModel` 与异步生成器 `stream` 的普通对象即可注册并流式应答。这推翻了早先"适配器包无法提取"的结论——该判断从未被验证过。

**对着录下的行为移植，不对着记忆移植。** 对每个翻译器与序列化器，先用固定语料运行仓库内实现，把输出录成 JSON。移植版的测试与这份录音比对，任何一侧的漂移都会响亮地失败。快乐路径上它什么都没抓到——重点在于它能抓到它所针对的一切：`argumentsDelta` 误写为 `arguments` 会把字符串 `"undefined"` 拼进每个工具调用且毫无报错；两个 provider 相反的缓存记账约定（Anthropic 报告的 input tokens 已扣除缓存读；OpenAI 含在内）在任一方向都只产生静默错误的成本数字。

**在加载时校验词表。** 独立插件依赖的运行时事实，仓库在首个发布前不作任何兼容承诺。每个插件在 `apply` 期间用固定载荷重查自己发出的 chunk 词表，漂移即拒绝挂载并点名变化的字段——否则一个改名的字段会污染输出而毫无报告。

一处有意偏离请求的形态：两个订阅适配器作为**一个**包发布而非两个。它们的 wire 格式毫无共享，但凭据机制——跨进程写锁、PKCE 流程、刷新周期——完全相同，而这正是 bug 会损坏真实 token 的代码。复制到两个仓库后，修在一处漏在另一处会静默失败；一个包让锁只有唯一属主。`routes` 配置可单独启用任一订阅。

跨进程写锁从 `packages/util/atomic-write` 逐字移植，包括看似无关的部分：独占创建是唯一的跨进程互斥，与基于 rename 的提交配对才使读者免锁。其测试 fork 真实进程，并含一个关闭锁并断言损坏出现的阴性对照。

## 考虑过的替代方案

- **把 workspace 包发布到 npm**——`@deepseek-ai` 作用域只有 DeepSeek 能发布，且 registry 上的 pre-release 版本（`0.0.1-rc.1`）不满足本 checkout（`0.1.0-rc.8`），外部插件会被钉死在一组冻结而错配的版本上。
- **对构建出的 `lib/` 打补丁**，如某个社区插件所做——任何重建都会抹掉补丁。
- **向上游贡献**——必须留在 harness 内的部分（编辑器页签、可移动侧栏）的正确路径，其分支已存在；提取服务于独立即有用的部分。

## 后果

- 四个独立插件存在，均从 GitHub 安装并验证注册：`dsh-docker`、`dsh-monaco`、`dsh-cliproxy`、`dsh-subscriptions`。
- profile 可以用发布插件替换仓库内行：禁用其一、启用另一。两者声明相同 id，每对恰好一个可激活，否则第二次注册以 `DUPLICATE_ADAPTER` 拒绝。
- 独立插件独立于本仓库漂移，必须在能检测时于加载时响亮失败；其 README 声明这一点，且不钉住任何无法验证的东西。
- 仓库内包仍是参考实现；录制语料来自它们的翻译器与序列化器，此处的改动会使彼处的语料失效，移植版的测试套件会说明这一点。
