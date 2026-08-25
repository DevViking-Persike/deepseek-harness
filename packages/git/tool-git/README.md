# @deepseek-ai/dsh-tool-git

English | [中文](README.zh.md)

Model-facing Git tools over the [git seam](../git/README.md).

## What it registers

| Group | Tools | Default |
|---|---|---|
| `inspect` | `git_status`, `git_diff`, `git_log` | on |
| `mutate` | `git_stage`, `git_unstage`, `git_discard`, `git_commit` | off |

Reads observe; they cannot damage a repository, and their value does not depend on a deployment's opinion. The mutating group writes to a repository the deployment owns — `git_discard` destroys uncommitted work and `git_commit` writes history — so enabling it is a deployment decision. Each group contributes its own prompt section, so a read-only composition never tells the model about tools it does not have.

Registration follows enablement, not availability. An enabled tool stays visible when no backend is usable, and execution fails with the structured `GitError`, so plugin load order and machine state never enter the model-facing schema.

## Both sides of the index reach the model

`git_status` reports `staged=` and `unstaged=` per path rather than one merged word. A file can be staged as added and then modified again, and the model needs to know which before it stages or commits.

## A discard stays undoable

`git_discard` reports the `recoveryId` the seam produced when it preserved the replaced content. The prompt tells the model to pass that id on, so a user who lost work they wanted can get it back.

## Config

| Key | Default | Meaning |
|---|---|---|
| `inspect` | `true` | Register the read group |
| `mutate` | `false` | Register the mutating group |
| `inspectTimeoutMs` | `30000` | Budget for one read |
| `mutateTimeoutMs` | `120000` | Budget for one mutation (hooks run here) |
| `maxDiffChars` | `40000` | Cap per side of one `git_diff` |

A `git_diff` is capped from its **head**, unlike a log tail: the interesting part of a file is its beginning, and a diff whose start the model cannot see is not usable.

## Model Experience

### System prompt

#### What the model sees

Each enabled group contributes one section: the read group at order 113 and the mutating group at order 114. A scoped tool restriction does not remove these independently registered sections.

##### Read-only Git guidance

```markdown
Use git_status to see which files changed in a repository and whether each change is staged, git_diff to read one file's before and after content, and git_log to read recent commits. Every repository path must be absolute. These tools only observe; they never stage, discard, or commit anything.
```

##### Mutating Git guidance

```markdown
Use git_stage and git_unstage to choose what a commit will contain, git_commit to record the staged changes, and git_discard to restore a file. git_discard destroys uncommitted work; it reports a recoveryId you can report back to the user so the change can be restored. Never commit without being asked to.
```

#### Token effect

Fixed guidance cost per request for each config-enabled group, even when a restriction hides its schemas. `git_status` emits one line per changed path plus a branch line, bounded by the seam's `maxChanges`; `git_diff` emits at most `maxDiffChars` per side; `git_log` emits one line per commit.

#### KV Cache effect

Prefix-stable while enabled groups, scope, and guidance text are unchanged. Config enablement or plugin lifecycle may invalidate reuse from the first changed prompt section; scoped schema restrictions do not remove it. Tool results appear after the cached prefix.

## Known Limitations and Deferred Work

- **The mutating group runs without approval** — no Git-specific permission policy exists; a deployment wanting confirmation adds a `tools/pre-execute` policy, the same stance `tool-docker` takes.
- **No branch, merge, or remote tools** — the seam does not offer those operations, so neither does this package.
- **`git_status` has no path filter** — a large repository reports every changed path up to the seam's bound; restricting the model to one subtree has no argument today.
