# @deepseek-ai/dsh-git-local

English | [中文](README.zh.md)

The local `git` CLI backend for the [git seam](../git/README.md), executed through `ctx.subprocess`.

## Why the CLI

The index format, rename detection, `.gitattributes` filters, and worktree/submodule resolution are the parts a JavaScript reimplementation diverges on at every Git release. This seam's value is agreeing with the `git` the user runs in their own terminal, so the CLI is the backend.

Every operation is one short-lived invocation with a fixed argv — never a shell string — and every path argument is passed after `--`, so a file named like an option is still treated as a path. `available()` runs `git --version`.

## Machine-readable formats

| Read | Format | Rule that decides the parser |
|---|---|---|
| status | `--porcelain=v2 --branch -z` | A rename spends **two** NUL records: the entry, then the original path |
| line counts | `diff --numstat -z` | A rename spends **three** records; a binary file reports `-` (no counts, not zero) |
| history | `--format` with NUL fields, RS records | Both separators are control characters a commit message cannot contain |
| worktrees | `worktree list --porcelain -z` | A `locked` with no stated reason emits the bare flag, and still reads as locked |
| graph | `--format` with US fields, RS records | `HEAD -> main` in `%D` is split so a lane label is the branch name alone |

`-z` framing is what makes paths with spaces, newlines, and non-ASCII names safe: records are NUL-separated and paths are never quoted or escaped.

Absent facts stay absent rather than becoming errors: a branch with no upstream omits `# branch.ab` entirely and reads as zero divergence; an unborn branch reports `(initial)` and reads as no head commit.

## Discovery

`discover` walks each root breadth-first to the requested depth, so a shallow repository is never lost to a deep sibling consuming the limit. A `.git` entry of either kind marks a repository — a *file* is how a submodule or linked worktree records itself, so testing for a directory alone would miss exactly the nested repositories the scan exists to find. Nesting is preserved rather than pruned, with inner repositories marked `submodule`.

Dependency and build directories (`node_modules`, `.venv`, `dist`, `target`, and their kin) are never descended into: each would cost an unbounded walk while holding repositories the user did not author. An unreadable directory is skipped rather than failing the scan.

## Comparing before a push

`compareBases` reads divergence with `rev-list --left-right --count` (base on the left, so the left count is `behind`), and only asks about conflicts when the base actually moved, using `merge-tree --write-tree`. That computes the merge in the object database: no working-tree file is written and no ref moves.

## Config

| Key | Default | Meaning |
|---|---|---|
| `cli` | `git` | Executable name or absolute path |
| `readTimeoutMs` | `30000` | One status, diff, log, discovery, or graph read |
| `writeTimeoutMs` | `120000` | One stage, unstage, discard, or commit (hooks run here) |
| `maxOutputBytes` | `4000000` | Collected output cap per invocation |
| `graceMs` | `5000` | Termination grace handed to the subprocess seam |
| `maxChanges` | `2000` | Changed paths one status reports before truncating |

Misconfiguration fails at load. A machine without `git` does not: availability is a per-call fact the seam probes during selection.

## Model Experience

Indirectly, through `dsh-tool-git`, which turns this backend's answers into tool schemas, prompt guidance, and retained tool-result tokens.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Discovery reads the filesystem, not `git`** — a repository whose `.git` is present but corrupt is discovered and fails on first use, which is the honest order: probing every candidate with a `git` process would cost one process per directory.
- **The skip list is fixed** — the never-descended directory names are a property of what those directories are, not a deployment choice; a workspace needing different ones has no configuration for it today.
- **`readTimeoutMs` bounds each invocation, not a status** — one status runs three invocations (status plus both numstat sides), so a pathological repository can take up to three times the read timeout.
