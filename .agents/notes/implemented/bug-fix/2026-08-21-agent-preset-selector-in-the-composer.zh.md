# Agent Note: agent preset 选择器落在 composer，与标题旁标签互斥

Status: implemented

[English](2026-08-21-agent-preset-selector-in-the-composer.md) | 中文

## Problem

用户在新建会话界面选了「创造模式」，随后在刚刚开始的那个会话的聊天标题栏里读到「标准模式」，而且无从判断哪一个才作数。

两个表层在同一时刻展示同一个会话。chip 占据 `conversation.hero.agentPreset`——Hero 行中工作区选择器旁边的一个根作用域槽位——而标签占据 `conversation.session.header.actions`，其显示条件仅仅是会话摘要携带了某个 preset。会话为空白期间 Hero 行与会话标题栏同时在屏，于是实时选择器与静态名称并存；而只要暂存值尚未抵达会话，二者就会不一致：chip 显示暂存的选择，标签显示摘要仍然记录的组装。

这种放置方式让分歧从偶发变成常态。chip 落在用户去往输入框途中一掠而过的装饰上，而它承载的决定在整个空白状态期间始终成立——于是用户想回看的那个控件，恰好在标题栏开始与它矛盾的时刻退出了注意范围。

## Decision

同一时刻只有一个会话绑定表层，二者都以同一个 `blank` 位为依据。

选择器成为 `conversation.input.left` 中的一个条目——即 composer 卡片自己的工具行，紧邻访问模式与 plan 装饰——注册时携带 `id: 'agent-preset'` 与 `order: -10`，因而位于该行首位：组装正是该行其余控件据以运作的前提。该槽位的 `InputZone` owner 份额本就携带 `session.blank`，也就是宿主推导、并在首条被接受的提示上翻转的同一个位，因此把选择放到用户作出该选择的位置，无需新增任何 owner prop、hook 或订阅。

`AgentPresetSeat` 在 `blank` 为假时返回 null，并在该状态下跳过名单加载，因此已开始的会话不为一个用不上的控件付出任何代价，chip 也绝不会成为长期禁用的摆设。`AgentPresetLabel` 从它本就读取 preset 的同一份会话摘要中读取 `blank`，并在会话为空白期间自行隐去。二者由构造保证互斥，依据是同一来源的同一个事实，因此任何会话都不会为同一份组装同时呈现实时选择器与静态名称。

`conversation.hero.agentPreset` 被删除——槽位键、其 `HeroAgentPresetOwnerProps` owner 份额、`conversation` 条目 children 表中的那一行，以及 Hero 工作区行里的 `renderSlot` 调用。把它保留为「仅无会话状态」的席位，只会为一个 composer 已经覆盖的状态留住重复契约：Hero 渲染时其下就有一个空白会话，而 `conversation.input.left` 在 Hero 与停靠两种 composer 形态中都会渲染。

暂存机制未变。chip 仍以部署默认值打开，仍是暂存而非直接应用，`AgentPresetSeatController.apply()` 仍会丢弃指向已非空白会话的暂存值——设置页的创建入口在任何会话存在之前就已暂存，冷启动更是没有会话，因此选择必须仍能先于它的会话发生。

## Alternatives considered

**保留 Hero chip，仅隐去标题旁标签。** 这样一处改动即可消除可见矛盾，但选择仍留在用户已经走过、而决定仍然成立的装饰上，也仍然保留一个根作用域槽位，其占用者需要该槽位无法提供的会话事实。被反馈的困惑是症状，放置方式才是病因。

**Hero chip 保留给无会话冷状态，另为空白会话新增 composer chip。** 同一个控件注册两次、两个 locale 席位、两条销毁路径，契约中仍然声明着一个重复表层——而这一切是为了一个 composer 早已挂载、且早已渲染 `conversation.input.left` 的状态。

**chip 落在 composer，但首轮之后禁用，并以拒绝原因作提示。** 这对宿主规则是诚实的，但它会在一行活控件之中，把此后整个会话的时间都耗在一块死装饰上；而且它想说的话，标题旁的标签说得更好。

**不移动 chip，而让标题旁标签在空白期间可编辑。** 会话标题栏是报告既定事实的地方；让它有条件地可交互，等于一个元素承担两种含义，而它并不是在输入之前作决定的合适位置。

## Consequences

- GUI 契约少了一个槽位。`conversation.hero.agentPreset` 已从 `SlotMap`、`conversation` 条目的 children 表、`ConversationSlotProps` 以及生成的 `slot-catalog.ts` 中消失；`conversation.input.left` 现在报告 agent-preset 占用者，并为此后任何「选择随对话开始而关闭」的条目记录了 `session.blank` 这一写法。
- 席位从根作用域改为会话作用域、从 `single` 槽位改为 `list` 槽位，因此其注册现在必须携带 `id`，其组件也获得会话标准 props。它的测试改为喂入 `InputZone` owner 份额，而非一个空 owner 对象。
- 标题旁标签现在需要会话摘要中的 `blank`，而 `SessionSummary` 本就携带它；会话列表尚未跟上的摘要依旧不渲染任何内容，行为不变。
- 未组装任何 preset 的部署不受影响：名单为空，行、chip、标签与分区都不渲染任何内容。
- 冷启动状态——尚未连接工作区、根本没有会话时——不再提供该 chip。`conversation.input.left` 是严格的会话作用域，骨架只在会话存在后才渲染它；而被删除的 Hero 席位是根作用域，没有会话也会渲染。此时的 composer 本就是惰性的（文本框充当工作区选择器触发器，无法发送任何 prompt），而连接工作区会创建或复用一个空白会话，chip 正是在那里出现，且部署默认值仍处于暂存状态。通用设置行仍然是无会话时更改默认值的途径。
