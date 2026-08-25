# @deepseek-ai/dsh-client-ui-git

English | [中文](README.zh.md)

Version control inside the editor tab: pick a repository, review what changed, stage or discard it, and commit.

## What it registers

One `conversation.view.editor.panel` entry (`id: 'git'`, `order: 10`) — a panel **inside** the Editor tab, not a tab of its own.

That placement is the design. Reviewing a change and editing it share one file tree, one buffer, and one session; two sibling tabs would duplicate all three and split one workflow in half. Clicking a changed file opens it in the editor's own buffer, and a discard that rewrites the open file asks the editor to reload it.

## Every workspace's repositories

The picker lists repositories found beneath **every** registered workspace, not just the session's own directory, with nested ones marked. A monorepo with submodules and a machine with several projects both appear in one list.

## Every checkout, and what is in it

When a repository has more than one checkout, the panel lists them with each one's branch, state, and **change count** — so what is in each worktree is visible without opening them one by one. Mutations address the checkout being shown: each worktree owns its index, and staging in one must never touch another. Locked and directory-gone checkouts are marked and inert, because both change what may be done there.

## Warning before a push

When `main` or `develop` moved underneath the branch, the panel says by how much; the warning turns red when merging back would conflict. The check uses `merge-tree`, which moves no ref and writes no file. Being merely ahead raises nothing — that is the ordinary state of work in progress.

## The graph

A `Changes | Graph` switch shows the commit graph: lanes drawn in SVG, merges as converging strands, branch tips labelled. The graph is only read while it is showing, since it is the most expensive call this panel makes.

## Seeing what changed

Selecting a changed file expands its diff in place, drawn with the shared `DiffBlock`. A change with nothing left unstaged is read against HEAD; anything else compares the working tree, which is the side the person is looking at. Opening the file in the editor buffer is the separate **Open** action beside it, so reviewing never navigates away by accident.

## Discarding says where the work went

A discard destroys uncommitted work. The host preserves the replaced content first and returns its object id, and this panel reports that id rather than letting the change vanish silently — the difference between a discard you can undo and one you cannot.

## Two ways to commit

| Route | What it does | When it fits |
|---|---|---|
| **Commit** | Writes directly over the `git.commit` RPC | The operator's own gesture, like the editor's Save |
| **Commit via agent** | Prompts the session's agent to run `git_commit` | The commit should appear in the session log |

The direct button is an explicit exception to the harness's *model-visible ⟺ logged* rule, taken because a commit made from the panel is the same standing as a file saved from the editor beside it. The agent route exists for anyone who wants the audit trail; the [Agent Note](../../../.agents/notes/implemented/architecture/2026-08-23-git-capability-seam-and-editor-panel.md) records the tradeoff.

## Model Experience

None, as this package renders repository state for a human and touches no prompt, message, schema, stream, or tool result. The model-facing Git tools live in [`dsh-tool-git`](../../git/tool-git/README.md).

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No per-hunk staging** — staging is per file; `git.stage` takes paths, and a hunk protocol has no consumer yet.
- **The diff is whole-file, not per hunk** — `DiffBlock` draws both sides in full, so a very large file renders its whole content rather than only the changed region.
- **Only one recovery is offered at a time** — the panel shows the most recent discard's id, so discarding twice before dismissing leaves the first id visible only in the host's object database.
- **No branch, merge, or remote controls** — the seam offers none, so neither does this panel; `ahead`/`behind` are reported without a way to reconcile them.
- **The graph does not scroll independently** — it renders the commits the host returned and reports truncation, without paging further back.
- **The list does not refresh on its own** — a change made outside the panel (the agent editing a file) appears when the repository is reselected or an action settles, because the host publishes no repository-change event.
