# @deepseek-ai/dsh-client-ui-knowledge

English | [中文](README.zh.md)

A Settings section for what a session can draw on: the skills it can invoke, the decision records it is bound by, and the documentation it can read.

## What it registers

One `settings.section` entry (`id: 'knowledge'`, `order: 25`), after Plugins and before Agent presets. Managing what a deployment knows is configuration rather than per-session work, which is why this is a settings page and not a conversation tab.

## Origin is the load-bearing column

A skill committed to the project and one living only in the operator's home behave identically at the prompt and differently for everyone else. The section therefore groups the registry's source ids into three origins:

| Shown as | Registry sources | Meaning |
|---|---|---|
| project | `project-dsh`, `project-agents` | Committed with the repository; every collaborator gets it |
| global | `user-dsh`, `user-agents` | This machine only |
| built in | everything else | Supplied by the running composition |

The registry's `-dsh` versus `-agents` distinction matters to the loader, not to the reader, so both fold into one origin here.

## Where the data comes from

Skills arrive through the existing `skill.list` RPC. Decision records and documentation are ordinary Markdown, read through the editor domain's workspace-fenced `listDir` and `readFile`, so this section adds no second route to the disk.

Records are read one level below their root — a note is filed under its kind (`implemented/architecture`) — and a directory a project does not have is skipped rather than reported, because a repository without `docs/adr` is ordinary rather than broken.

## Model Experience

None, as this package reports what a session can reach for a human and touches no prompt, message, schema, stream, or tool result. It does not change what reaches the model.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Read-only** — installing, enabling, disabling, or editing a skill still happens on the filesystem; the wire carries no mutation for any of it.
- **The knowledge directories are a fixed list** — `docs/adr`, `.agents/notes/proposed`, `.agents/notes/implemented`, `docs`, and `.agents`. A project filing records elsewhere sees empty panes, and making the list configurable needs a settings namespace this package does not own.
- **Markdown is shown as plain text** — rendering would pull a Markdown pipeline into a settings page whose purpose is to locate a document, not to read it at length.
- **Records are listed one level deep** — an archived note nested further is not shown. Archive is not current record, but the pane is therefore not an exhaustive file listing.
