# DeepSeek Harness Desktop

Electron shell for the existing Harness Web profile. The shell starts the real `dsh web` Host on an operating-system-assigned loopback port, waits for the Host readiness announcement, and loads that URL in a sandboxed renderer. It does not own another web server or frontend build.

## Development

```sh
pnpm --filter @deepseek-ai/dsh-desktop dev
```

The command must run from a checkout where `pnpm dsh web` is available. Set `DSH_DESKTOP_CWD` when the Host should start in another workspace. `DSH_DESKTOP_COMMAND` may point to a packaged `dsh` executable; when set, the shell invokes it directly instead of `pnpm dsh`.

Before either launch path starts the Host, the desktop prepends the selected Node directory, workspace binaries, `~/.local/bin`, `~/.cargo/bin`, `~/go/bin`, and common Homebrew locations to the inherited `PATH`. This supplies developer tools that Finder and LaunchServices omit from the GUI environment. A command required by the selected profile still fails startup when it is absent from those locations and the inherited path.

## Security and lifecycle

The renderer has Node integration disabled, context isolation enabled, and Chromium sandboxing enabled. It may navigate only within the exact loopback origin announced by the supervised Host. HTTPS links open through the operating system; other cross-origin navigation is denied.

Application quit sends `SIGTERM` and waits five seconds for the Cordis fiber to dispose. A Host that does not exit receives `SIGKILL` before Electron completes shutdown.

## Known limitations

This package is a development MVP, not a signed installer. It depends on a checkout or packaged `dsh` executable and has no updater, tray integration, crash recovery, or `file://` IPC carrier. Distribution work must deploy the CLI dependency closure outside ASAR, sign the Electron application, and validate platform-specific process-tree teardown.
