# @deepseek-ai/dsh-client-ui-editor

English | [中文](README.zh.md)

A code editor beside Chat: browse the session's workspace, open a file, edit it, and save.

## What it registers

One `conversation.view` entry (`id: 'editor'`, `order: 30`), so it sits after Chat, Trajectory, and Docker. The tab is a file tree beside a [Monaco](https://github.com/microsoft/monaco-editor) buffer.

## Concurrent edits

Every write carries the `FsVersion` the file was read at. A save that would overwrite an edit made since then — usually the agent's, working in the same workspace — is refused by the host with `editor-stale`, and the tab offers a reload instead of silently winning. Neither side's work is lost without being shown.

The tree root follows the addressed session's own `cwd`, so a conversation opened in another project shows that project rather than the deployment's directory.

## Language support

| Concern | Where it comes from |
|---|---|
| Syntax colors | The harness palette (`--shiki-token-*`), read from the live document, so code here matches code in a chat message |
| Indentation | `language-configs.ts` — rules vendored from microsoft/vscode (MIT); C# is hand-authored because upstream ships none |
| Hover, definition, references | The `lsp` seam, when a composition mounts one |

Monaco runs without web workers and falls back to main-thread language services. Highlighting, folding, find, and multi-cursor work; cross-file IntelliSense does not.

## Model Experience

None, as this package renders workspace files for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No completion and no inline diagnostics** — the `lsp` seam is deliberately closed to four semantic queries (definition, references, implementation, hover), and diagnostics are push-shaped, which that request/response contract cannot carry.
- **One file is open at a time** — tabs would need a store surviving remounts, and no consumer has asked for them.
- **No project-wide search** — `grep` remains the agent's tool for that, and duplicating it in the browser would need its own RPC domain.
- **Saving is whole-file** — a large file re-sends its whole text on every save; a diff protocol has no current consumer.
- **Plain text gains no syntax color** — `.txt` and its kin resolve to Monaco's `plaintext`, which has no keywords; they gain the editor's background, line highlighting, and gutter only.
