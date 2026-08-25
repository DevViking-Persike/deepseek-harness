# @deepseek-ai/dsh-client-ui-repositories

[English](README.md) | 中文

代码仓库会话视图：浏览、检视与管理工作区关联的代码仓库及代码托管平台集成。

## 注册内容

一个 `conversation.view` 条目（`id: 'repositories'`，`order: 40`）——作为与 Chat、Trajectory、Docker 和 Editor 并列的顶层标签页。

该页签提供一个内部导航外壳，并声明子 slot 列表 `conversation.view.repositories.section`。各个仓库源子插件（如 Local、GitHub、GitLab）向此 slot 列表注册，并通过 slot 注册表被动态发现。外壳会渲染所有已注册节区的导航标签页，默认选中 Local，并仅渲染当前选中的节区。

## Model Experience

### 仅供操作员界面呈现

#### What the model sees

本浏览器端包仅渲染 `conversation.view` 页签的操作员界面，不贡献任何提示词段落、工具或模型可见消息。

#### Token effect

本包不对提示词或模型会话流贡献任何文本或 token。

#### KV Cache effect

无；本包不组装也不发送模型请求。

## Known Limitations and Deferred Work

- **初始页签选择策略** — 默认优先选中 `'local'` 节区，若不存在则回退至首个可用节区；跨页面刷新持久化每个会话的页签选择状态留待后续 store 扩展实现。
