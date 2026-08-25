# @deepseek-ai/dsh-git

English | [中文](README.zh.md)

The Git capability seam: `ctx.git`, a provider registry, and the vocabulary every consumer programs against.

## What it owns

| Concern | Detail |
|---|---|
| Service | `ctx.git` (`GitRuntime`), one instance per context |
| Registry | `registerProvider(provider)` returns the disposer; duplicate ids are rejected |
| Selection | Configured id wins; otherwise exactly one usable provider auto-selects |
| Errors | `GitError` with a machine-routable `code` |

Repository discovery, status, diffs, history, and index/worktree mutation share one seam because they share one repository resolution, one selection decision, and one error taxonomy. Their request and result types stay separate.

## Selection

Resolved at execution time and never dependent on registration order:

| Situation | Outcome |
|---|---|
| Configured id, registered and usable | that provider |
| Configured id, not registered | `GIT_PROVIDER_CONFIGURED_MISSING` |
| Configured id, registered but unusable | `GIT_PROVIDER_CONFIGURED_UNAVAILABLE` |
| No id, exactly one usable provider | that provider |
| No id, several usable providers | `GIT_PROVIDER_AMBIGUOUS` |
| No id, no usable provider | `GIT_PROVIDER_UNAVAILABLE` |

Availability is re-probed on every call rather than cached. A repository is initialized, cloned, or deleted during an ordinary session, so a cached answer would route an operation to a backend that no longer applies.

## Both sides of the index are independent facts

`GitFileChange` carries `index` and `worktree` separately because Git's two-letter status is genuinely two facts: a file can be staged as added and then modified again in the working tree. Collapsing them into one word is what makes a UI unable to offer stage and unstage on the same row. The absent half of a one-sided change reads as `unmodified`, so consumers switch over a closed union instead of testing for undefined.

## Every checkout is addressable

`worktrees` lists every checkout of a repository. A repository always has its main working tree, and `git worktree add` creates more — each with its own directory, HEAD, and index over one shared object database. Locked, prunable, and bare states stay distinct because they decide what may be done with that checkout.

## Checking before a push

`compareBases` reports `ahead`, `behind`, and whether merging back would conflict, per integration branch. `behind > 0` is the fact that decides whether a push is safe, and the conflict answer is computed without touching the working tree — asking before a push costs nothing and changes nothing.

## Discarding preserves what it replaces

`discard` returns a `recoveredOid` naming the content it destroyed, readable through `readBlob`. A discard is the one operation here that can lose uncommitted work, so the seam requires providers to make that work addressable afterwards rather than gone.

## Model Experience

Indirectly, through `dsh-tool-git`, which turns repository state into tool schemas, prompt guidance, and retained tool-result tokens.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No merge, rebase, or conflict resolution** — each is a state machine with its own lifecycle and abort points, which this request/response contract cannot express; `GitChangeKind.conflicted` reports that a conflict exists without offering to resolve it.
- **No remote operations** — push, pull, and fetch reach credentials and network endpoints, whose permission model is a separate decision; `ahead`/`behind` report divergence without offering to reconcile it.
- **No branch or stash operations** — no current consumer needs them, and adding them later is additive.
- **Whole-file diffs, not patches** — `GitDiff` carries both sides in full because the browser draws them that way; a consumer wanting a unified patch reconstructs it.
