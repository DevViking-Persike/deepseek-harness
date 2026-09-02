# Agent Note: Electron desktop Host supervision

Status: implemented

English | [中文](2026-08-31-electron-desktop-host-supervision.zh.md)

## Problem

A desktop application must preserve the Web profile's Cordis composition, user patch layers, persistence, and shutdown behavior without duplicating the frontend or assembling a second Host. The shell must also confine renderer navigation and reach process quiescence when the application exits.

## Decision

`apps/desktop` supervises the real `dsh web` profile as a child process and loads its announced loopback URL in an Electron `BrowserWindow`. The CLI owns profile resolution, plugin activation, persistence, and shutdown. The desktop process owns native window lifecycle and treats the `dsh web: <url>` line, emitted after loader settlement, as its readiness signal.

The readiness parser accepts only HTTP URLs on `127.0.0.1` or `localhost`. The renderer enables context isolation and Chromium sandboxing and disables Node integration. Navigation stays on the announced origin; HTTPS links open through the operating system, while other cross-origin schemes are denied.

The Host child receives a deterministic command-search path: the selected Node directory, the checkout's `node_modules/.bin`, conventional user tool directories (`~/.local/bin`, `~/.cargo/bin`, and `~/go/bin`), Homebrew locations, and then the inherited `PATH`. Source launches and `DSH_DESKTOP_COMMAND` use the same environment. Configured LSPs and other tools can therefore resolve executables in a reduced GUI environment without running interactive or login shell initialization.

Application quit sends `SIGTERM` and waits for the child exit before completing. After a bounded grace period it sends `SIGKILL` and still waits for the exit event. Normal shutdown therefore preserves Cordis disposal without allowing a stuck Host to orphan the desktop process.

## Alternatives considered

**Assemble Cordis inside Electron.** This would create a second boot path whose profile resolution, patch ordering, startup diagnostics, and shutdown behavior could diverge from `dsh web`.

**Use Tauri with a Node sidecar.** The product depends on Node modules loaded from profile directories, subprocess execution, and optional native addons. Tauri would still ship Node separately and would add another signing and update lifecycle without removing the runtime dependency.

**Implement the reserved `file://` IPC request carrier immediately.** The existing Web carrier already provides the correct boot manifest, plugin bundles, RPC, streaming, and upgrade behavior. IPC remains a distribution optimization after the shell lifecycle is proven.

**Run a login shell to obtain its `PATH`.** Shell initialization may block, print output, mutate state, or execute arbitrary user code before readiness. Explicit conventional prefixes followed by the inherited `PATH` keep startup deterministic.

## Consequences

Browser and desktop use one Host boot path and one frontend. The development MVP launches the CLI from a source checkout or an executable selected through `DSH_DESKTOP_COMMAND`; it is not yet a signed installer.

Distribution must deploy the CLI dependency closure outside ASAR, validate native addons per target, stop the complete process tree on Windows, and add signing, notarization, update, crash-recovery, and single-instance integration tests. Focused tests pin readiness parsing and renderer navigation policy, while package typechecking covers the Electron integration.

This note partially realizes the Electron direction reserved by [GUI layering and RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md). That note remains active because it owns the shared Client/RPC architecture and the future IPC carrier rather than this shell's process supervision.
