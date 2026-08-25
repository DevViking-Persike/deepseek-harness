# @deepseek-ai/dsh-client-ui-repository-gitlab

[English](README.md) | 中文

代码仓库会话视图的 GitLab 节区：展示未配置宿主 Provider 的真实状态，并呈现预期的远程代码托管与流水线协作特性。

## 注册内容

一个 `conversation.view.repositories.section` 条目（`id: 'gitlab'`，`order: 30`）——位于代码仓库视图中的“GitLab”节区。

## Model Experience

### 仅供操作员界面呈现

#### What the model sees

本浏览器端包仅渲染 `conversation.view.repositories.section` 的操作员界面，不贡献任何提示词段落、工具或模型可见消息。

#### Token effect

本包不对提示词或模型会话流贡献任何文本或 token。

#### KV Cache effect

无；本包不组装也不发送模型请求。

## Known Limitations and Deferred Work

- **宿主 Provider 待接入** — 需等待 `@deepseek-ai/dsh-provider-gitlab`（或对应宿主凭据与 API 网桥）接入后方可进行实时远程仓库浏览、MR 评审、CI/CD 状态跟踪及克隆等操作。
