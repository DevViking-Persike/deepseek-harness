# @deepseek-ai/dsh-client-ui-repository-local

[English](README.md) | 中文

代码仓库会话视图的本地仓库节区：通过宿主现有的 `git.*` RPC 域，检视所有已打开工作区中的 Git 仓库列表与分支状态摘要。

## 注册内容

一个 `conversation.view.repositories.section` 条目（`id: 'local'`，`order: 10`）——位于代码仓库视图中的“本地仓库”节区。

## Model Experience

### 仅供操作员界面呈现

#### What the model sees

本浏览器端包仅渲染 `conversation.view.repositories.section` 的操作员界面，不贡献任何提示词段落、工具或模型可见消息。

#### Token effect

本包不对提示词或模型会话流贡献任何文本或 token。

#### KV Cache effect

无；本包不组装也不发送模型请求。

## Known Limitations and Deferred Work

- **只读状态检视** — 暂存、丢弃与提交等变更操作位于编辑器版本控制面板（`@deepseek-ai/dsh-client-ui-git`）；本节区专注于多工作区仓库发现与状态总览。
