# @deepseek-ai/dsh-client-ui-repository-github

[English](README.md) | 中文

代码仓库会话视图的 GitHub 节区：展示未配置宿主 Provider 的真实状态，并呈现预期的远程代码托管集成特性。

## 注册内容

一个 `conversation.view.repositories.section` 条目（`id: 'github'`，`order: 20`）——位于代码仓库视图中的“GitHub”节区。

## Model Experience

### 仅供操作员界面呈现

#### What the model sees

本浏览器端包仅渲染 `conversation.view.repositories.section` 的操作员界面，不贡献任何提示词段落、工具或模型可见消息。

#### Token effect

本包不对提示词或模型会话流贡献任何文本或 token。

#### KV Cache effect

无；本包不组装也不发送模型请求。

## Known Limitations and Deferred Work

- **宿主 Provider 待接入** — 需等待 `@deepseek-ai/dsh-provider-github`（或对应宿主凭据与 API 网桥）接入后方可进行实时远程仓库浏览、PR 审阅及克隆等操作。
