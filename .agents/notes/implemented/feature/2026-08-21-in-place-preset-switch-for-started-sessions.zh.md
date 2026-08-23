# Agent Note: A started session switches agent presets in place

Status: implemented

English | [中文](2026-08-21-in-place-preset-switch-for-started-sessions.md)

## Problem

会话的 agent preset 在跑过任何轮次后即被固定。宿主对已开始会话的任何 `agentPreset.select` 都返回 `agent-preset-locked`，理由是替换组装会"搁浅已记录的工具调用"——在旧 preset 的工具下产生的历史，会在一个无法再发起这些调用的 agent 面前重放。

这一理由混淆了两个不同的 wire 事实。提供商请求把**已完成的**工具调用/结果对作为历史序列化（Anthropic 为 `tool_use`/`tool_result`，OpenAI Responses 为 `function_call`/`function_call_output`），与请求当前的 `tools` 目录无关；两个原生适配器都不校验历史工具名与当前 schema 的匹配。旧调用是持久证据，不是活跃的工具契约。替换真正改变的只是**下一次请求**组装的内容——新组装的 system prompt 与工具 schema。因此这把锁拦下的其实是 wire 格式本身接受的东西，用户为了换一个会话运行的模式，不得不 fork 一个延续（新会话、新界面）。

## Decision

`agentPreset.select` 对已开始且轮次已落定的会话原地重组。会话、其历史、工作区挂接与 id 全部保留；`presets.recompose` 替换组装子树（先卸载再挂载，失败恢复原组装），提交后的切换照空会话切换一样追加 `agent-preset/selected`——`resolveSessionPreset` 以最后一个事件为准，因此恢复时重建的是新组装。Web 客户端的头部选择器直接调用它，并把确认的 preset 折进共享会话摘要（`noteAgentPreset`；upsert 保持 `blank` 单调，`agentPreset` 以最新为准）。

唯一保留的拒绝是轮次运行中：`agent.status === 'running'` 时返回 `agent-preset-locked`。在某一步的请求与其工具执行之间替换工具集会搁置仍在旧 schema 下产生的工作；已落定的会话没有这样的在途窗口。按会话的切换仍经由既有 `presetSwitches` 队列串行化，并在队列内重读状态。

`session.fork` 的可选 `agentPreset`（派生延续路径）保留给需要分支的调用方：以不同组装、携带源会话已完成转录种子的子会话，源会话不被触碰。原地切换与 fork 现在是同一个 recompose 缝合之上的两个诚实选项，而不是一个真实能力加一个拒绝。

## Alternatives considered

**保留仅空白可切的锁，只提供 fork 延续。** 安全，但对用户而言"换这个聊天的模式"意味着换界面、换会话身份，而且 wire 格式分析表明搁浅理由对已完成历史并不成立。

**切换时转换转录（剔除工具调用、重建合成轮次）。** 能保证新模型看不到它无法重复的调用，但会销毁持久证据、破坏重放确定性，并为提供商并不要求的好处重写共享表层机制。

**按工具集子集/超集阻塞切换。** 一般情况下不可执行（preset 命名插件而非工具列表），也无必要：混合历史加新目录是有效的提供商输入。

## Consequences

- 替换失败仍恢复原组装；落账的 `agent-preset/selected` 只在替换提交后写入，日志绝不会声称一个 agent 并未运行的组装。
- 斜杠命令与 skill 目录照旧在转发的 `agent-preset/selected` 事件上失效；已开始会话的切换现在触发同样的失效，`/`-菜单跟随新组装。
- 可见转录中的历史工具调用可能命名新组装不再提供的工具。模型可以读取其结果，但不能重复这些调用；新请求只携带新 schema。这是会话中途切换的已记录权衡。
- 空白会话的 composer chip 与已开始会话的头部选择器仍在同一 `blank` 位上互斥；头部现在在旧标签只作报告的地方提供切换。
- 验证：`api-proxy-agent-preset.spec.ts` 固定落定轮次的切换（日志解析出新 preset）与运行中轮次的拒绝；头部选择器的组件与 apply 测试固定原地调用、当前 preset 的 no-op 与摘要折入；`api-proxy-fork.spec.ts` 仍固定一旁的 fork 路径。
