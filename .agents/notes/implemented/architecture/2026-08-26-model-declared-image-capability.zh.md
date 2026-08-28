# Agent Note：按模型声明的模态门控图片附件

Status: implemented

[English](2026-08-26-model-declared-image-capability.md) | 中文

## 问题

输入框对任何模型都接受图片。纯文本模型在发送时才拒绝，而那时消息已经持久化，于是会话不断重发一个不可能成功的请求——换模型也无法恢复，因为图片已在日志里。

阻止这一点的能力早已存在，却哪里都没到达。适配器声明 `inputModalities`，`LlmRuntime.resolveModelInfo` 会返回它，两条 host 路径也已据此门控。但 `buildModelCatalog` 投影模型条目时丢掉了该字段，因此 `session.models` 与 `llm.models` 对每个模型都回答 `inputModalities: null`，浏览器无从读取。

## 决策

让 `inputModalities` 穿过 `ModelCatalogModel` 及其 wire schema，并在浏览器侧据此门控附件路径。

该字段类型为 `string[]` 而非封闭枚举：`ModelModalityMap` 可合并扩展，因此 wire 承载适配器实际声明的内容，而不是本层需要同步维护的词表。

门控是 `ctx.conversation` 上新增的 `imageSupport` 注册表，与既有的 `blocks` 并列。它完全沿用那个注册表，因为约束相同：输入框无法引入 ui-model-selection——依赖方向是 ui-model-selection → ui-conversation，从不反向——所以由知情方推送，附件路径读取本会话的 store。

**取值是三态的，这是关键部分。** `true` 接受，`false` 拒绝，`undefined` 无法判断。只有**声明了**模态却不含 `image` 的 catalog 条目才拒绝；未声明模态的条目、不在建议分组中的模型、尚未加载的目录，都表示"无法判断"，绝不门控。这与 `routable` 一致，理由相同：以缺失为依据门控，会让缓慢或不可达的 host 锁死本可工作的附件路径。

两种错误的代价并不对等。声明不足只是拒绝一张操作者看得见、可通过换模型解决的图片；声明过度则会放行一张端点在消息持久化之后才拒绝的图片。因此在代价低处保守，在代价高处宽松。

与 `blocks` 一样，这是一种可用性提示而非强制：无论客户端禁用什么，host 仍会拒绝模型无法接受的图片内容。

## 考虑过的替代方案

- **当草稿含图片时，把模型列表过滤为支持图片的模型**——这会隐藏操作者想切换到的模型，且回答的是与"该模型能否看到它"不同的问题。
- **在 `ConversationController.createDraftImages` 内门控**——草稿层对模型选择一无所知，把它塞进去会颠倒 block 注册表专门规避的包依赖方向。
- **按 provider 路由而非按模型推导能力**——proxy 自身的注册表在同一路由内就不一致：`gpt-5.3-codex-spark` 是纯文本，而同路由的其他模型接受图片，按路由回答必然对其中之一是错的。

## 与多模态接入决策的关系

[持久化附件笔记](../feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md)写明浏览器"不快照部署限制或模型能力"，因为握手快照无法表示会话在 `session.selectModel` 之后的目标。

该约束依然成立，本次改动没有削弱它。它排除的是**陈旧的**客户端副本；这里的门控读取的是实时的每会话模型目录——即 `session.selectModel` 写入、两个选择入口共同渲染的同一份状态——并在每次变化时重新发布，因此它无法描述会话已经离开的目标。host 预检仍是权威边界，仍会拒绝模型无法接受的含图请求；本改动只是阻止输入框接受它已能判定会被拒绝的内容。

## 后果

- Catalog 消费方可以读取 `inputModalities`；缺失仍表示未知，因此消费方必须保留自己的回退，而不能把缺失当作纯文本。
- `ctx.conversation` 上多了一条能力通道。知晓会话模型能力的插件通过 `imageSupport` 发布；其他任何一方都不得写入，输入框只读取本会话的 store。
- 未声明任何模态的适配器保持现有行为：附件路径保持开放，host 仍是强制点。
- GUI 套件覆盖注册表的三态转换与推导的六个用例；再次静默丢失该字段的回归会在推导测试处失败，而不是抵达操作者。
