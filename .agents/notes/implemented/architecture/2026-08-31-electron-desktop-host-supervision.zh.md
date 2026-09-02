# Agent Note: Electron 桌面端 Host 监管

Status: implemented

[English](2026-08-31-electron-desktop-host-supervision.md) | 中文

## Problem

桌面应用必须保留 Web profile 的 Cordis 组合、用户 patch 层、持久化和关闭行为，同时不能复制前端或组装第二个 Host。应用壳还必须限制 renderer 导航，并在应用退出时使进程达到静止状态。

## Decision

`apps/desktop` 把真实的 `dsh web` profile 作为子进程监管，并在 Electron `BrowserWindow` 中加载它公布的 loopback URL。CLI 负责 profile 解析、插件激活、持久化和关闭；桌面进程负责原生窗口生命周期，并把 Loader 完成稳定后输出的 `dsh web: <url>` 行作为就绪信号。

就绪解析器只接受 `127.0.0.1` 或 `localhost` 上的 HTTP URL。renderer 启用 context isolation 和 Chromium sandbox，并禁用 Node integration。导航只能留在已公布的 origin；HTTPS 链接交给操作系统打开，其他跨 origin scheme 均被拒绝。

Host 子进程获得确定性的命令搜索路径：所选 Node 目录、checkout 的 `node_modules/.bin`、常规用户工具目录（`~/.local/bin`、`~/.cargo/bin` 和 `~/go/bin`）、Homebrew 目录，最后是继承的 `PATH`。源码启动和 `DSH_DESKTOP_COMMAND` 使用相同环境。因此，已配置的 LSP 和其他工具可以在精简的 GUI 环境中解析可执行文件，而无需运行 interactive 或 login shell 初始化。

应用退出时先发送 `SIGTERM` 并等待子进程退出。超过有限宽限期后发送 `SIGKILL`，随后仍等待 exit 事件。正常关闭因此保留 Cordis dispose，同时避免卡住的 Host 成为孤儿进程。

## Alternatives considered

**在 Electron 内组装 Cordis。** 这会产生第二条启动路径，其 profile 解析、patch 顺序、启动诊断和关闭行为可能偏离 `dsh web`。

**使用带 Node sidecar 的 Tauri。** 产品依赖从 profile 目录加载的 Node 模块、子进程执行和可选 native addon。Tauri 仍需单独分发 Node，并增加一套签名和更新生命周期，无法消除运行时依赖。

**立即实现预留的 `file://` IPC request carrier。** 现有 Web carrier 已提供正确的 boot manifest、插件 bundle、RPC、流和 upgrade 行为。应先证明应用壳生命周期，再把 IPC 作为分发优化。

**运行 login shell 以获得其 `PATH`。** shell 初始化可能在就绪前阻塞、输出内容、修改状态或执行任意用户代码。显式的常规目录前缀后接继承的 `PATH`，可以让启动保持确定性。

## Consequences

浏览器和桌面端共用一条 Host 启动路径和一个前端。开发 MVP 从源码 checkout 启动 CLI，或使用 `DSH_DESKTOP_COMMAND` 选择的可执行文件；它尚不是已签名安装包。

分发必须在 ASAR 外部署 CLI 依赖闭包，按目标平台验证 native addon，在 Windows 上停止完整进程树，并增加签名、公证、更新、崩溃恢复和 single-instance 集成测试。聚焦测试固定就绪解析和 renderer 导航策略，package typecheck 覆盖 Electron 集成。

本记录部分实现了 [GUI layering and RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md) 中预留的 Electron 方向。原记录继续有效，因为它负责共享 Client/RPC 架构和未来 IPC carrier，而非本应用壳的进程监管。
