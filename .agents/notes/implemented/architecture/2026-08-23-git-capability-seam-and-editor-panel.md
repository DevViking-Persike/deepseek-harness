# Agent Note: Git capability seam and the editor's version-control panel

Status: implemented

English | [中文](2026-08-23-git-capability-seam-and-editor-panel.zh.md)

## Problem

Reviewing uncommitted work is the most common thing a person does beside an agent that edits files, and the harness had no Git capability at all: no seam, no tools, no browser surface. Everything went through `bash`, where the model parses unbounded CLI text, the harness cannot bound the output, and no UI can render the result as anything but terminal text.

The gap is sharper than convenience. An agent and a person edit the same working tree at the same time. Without a surface that shows what changed, who staged what, and whether the branch can still be pushed, the person's only recourse is a terminal in another window — losing the connection between the file being reviewed and the file being edited.

Three facts about real machines shaped the design. A workspace holds more than one repository: a monorepo carries submodules, and a person keeps several projects side by side. A repository holds more than one checkout: `git worktree add` gives each its own HEAD, its own index, and its own working tree over one shared object database. And a branch's safety to push depends on a base that moves underneath it — `main` or `develop` advancing is what turns a push into a rejected one or a merge nobody reviewed.

## Decision

Git access is a capability seam following [the capability-seam Agent Note](2026-06-13-capability-seams.md), with a browser panel that lives **inside** the editor tab rather than beside it:

1. `@deepseek-ai/dsh-git` (`packages/git/git`) owns `ctx.git`, the provider registry, provider selection, the request/result vocabulary, and `GitError`.
2. `@deepseek-ai/dsh-git-local` (`packages/git/git-local`) drives the local `git` CLI through `ctx.subprocess`.
3. `@deepseek-ai/dsh-tool-git` (`packages/git/tool-git`) owns the model-facing schemas, prompt sections, output caps, and presentation.
4. `packages/host/apiproxy/src/api/git.ts` declares the browser `git.*` domain.
5. `@deepseek-ai/dsh-client-ui-git` registers one panel in the editor tab's panel ring.

Selection matches the [docker seam](2026-08-21-docker-capability-seam.md) rule and never depends on registration order. Availability is re-probed per call rather than cached: a repository is initialized, cloned, or deleted during an ordinary session, so a cached answer routes an operation to a backend that no longer applies.

### The CLI is the backend

`git-local` executes `git` as a fixed argv, never a shell string, and passes every path after `--` so a file named like an option stays a path.

The index format, rename detection, `.gitattributes` filters, and worktree resolution are the parts a JavaScript reimplementation diverges on at every Git release. This seam's whole value is agreeing with the `git` the user runs in their own terminal, which makes reimplementation the wrong trade regardless of dependency count.

Every read requests a machine-readable format, and the `-z` framing is what makes paths with spaces, newlines, and non-ASCII names safe: records are NUL-separated and paths are never quoted or escaped. Three framing rules decide the parsers, and each was recorded from a real `git` run rather than assumed:

- A **rename** spends two records in `status --porcelain=v2 -z` (the entry, then the original path) and three in `diff --numstat -z` (counts with an empty path, then old, then new).
- A **binary** file reports `-` for both numstat counts, which is the absence of line information rather than zero lines.
- A **locked worktree with no stated reason** emits the bare flag, which must still read as locked — that is what decides whether removal may be offered.

Absent facts stay absent rather than becoming errors: a branch without an upstream omits `# branch.ab` entirely and reads as zero divergence; an unborn branch reports `(initial)` and reads as no head commit.

### The panel lives inside the editor tab

The panel takes a seat in `conversation.view.editor.panel`, a slot the editor tab declares and renders through its own `Files | Source` switcher.

A sibling `conversation.view` tab was the obvious alternative and is worse. Reviewing a change and editing it share one file tree, one buffer, and one session; two tabs would duplicate all three and split one workflow in half. Inside the tab, clicking a changed file opens it in the editor's own buffer, and a discard that rewrote the open file asks the editor to reload it — the owner props carry `openFile` and `reloadBuffer` for exactly that.

The placement also removes an architectural problem rather than working around one. The editor owns the Monaco loader, and `packages/client/AGENTS.md` forbids importing another plugin package's symbols; a sibling tab wanting the same buffer would have needed an exception. A child slot passes what it needs through owner props, which is a sanctioned route.

### Both sides of the index are independent facts

`GitFileChange` carries `index` and `worktree` separately, and the absent half of a one-sided change reads as `unmodified` so consumers switch over a closed union.

Git's two-letter status is genuinely two facts: a file can be staged as added and then modified again. Collapsing them into one word is precisely what makes a UI unable to offer stage and unstage on the same row, and what leaves a model unable to tell what a commit would actually contain.

### Every checkout is addressable, and mutations follow the one being shown

`git.worktrees` lists every checkout with its branch, state, and **changed-path count**, so one call answers what is in each rather than forcing a request per row. A bare repository and a prunable checkout report no count, because neither has a working tree to read.

The panel's mutations address the checkout being shown, not the repository root. Each worktree owns its index and working tree, so staging in one must never touch another; a test pins that by asserting the path handed to `stage`.

### Discarding preserves what it destroys

`discard` writes the replaced content into the object database with `hash-object -w` **before** restoring the path, and returns its `recoveredOid`. The RPC row and the `git_discard` tool both surface that id.

This is the one operation here that can lose uncommitted work. Making it recoverable is what justifies allowing it on a domain the agent does not mediate, and it is a guarantee an editor's discard normally does not give.

### Push safety is a read, computed without touching anything

`git.compareBases` compares the checkout against the deployment's integration branches (`main`, `origin/main`, `master`, `develop`, and their remote spellings) and reports `ahead`, `behind`, and whether merging back would conflict.

`behind > 0` is the fact that decides whether a push is safe, so the panel warns on it and stays quiet when the branch is merely ahead — being ahead is the ordinary state of work in progress. The conflict answer comes from `merge-tree --write-tree`, which computes the merge in the object database: no ref moves and no working-tree file is written, so asking before a push costs nothing and changes nothing. Bases the repository does not have are omitted rather than shown as empty rows.

### The graph is lanes, and lane assignment is pure

`git.graph` returns commits with their parents and the branches anchoring them; `lanes.ts` turns that into columns and edges, and `GitGraph.tsx` draws it as SVG.

The layout rule is the one graph renderers converge on: a lane is reserved by a commit's children before the commit is reached, the first parent inherits the lane (keeping linear history in one column), and each further parent of a merge takes its own (drawing merges as converging strands). Converging strands collapse onto the **leftmost** column so history returns toward the trunk instead of drifting rightward down the page.

Lane assignment is a pure function separate from the component because topology is where a graph renderer goes subtly wrong — a strand in the wrong column misattributes which branch a commit belongs to — and that class of error is only cheap to catch in isolation. SVG rather than CSS boxes because the interesting part is the edges, which a border trick cannot express.

### Where the RPC/tool line falls, and the one exception

Reads, plus the mutations an operator applies to the working tree they are looking at (`stage`, `unstage`, `discard`, `commit`), live on the `git.*` domain. Operations that rewrite shared history or reach a remote — revert, reset, push, pull — stay out, and go through the agent's tools where the session log records them.

Committing directly from the panel is a **deliberate exception** to the repo's *model-visible ⟺ logged* rule. The docker seam rejected UI lifecycle for that rule, and Git is not symmetric to it: `compose down` changes machine state outside the workspace, while committing the working tree a person is looking at has the same standing as `editor.writeFile`, which already writes without a session event. The panel therefore offers **both** routes — a direct **Commit** and a **Commit via agent** that prompts `git_commit` so the turn lands in the session log — and the second exists precisely for anyone who wants the audit trail.

### Read tools ship on; mutating tools do not

`tool-git` registers `inspect` (default true) and `mutate` (default false) independently, and the shipped `packages/bundle/base/cordis.patch.yml` states both explicitly. Reads cannot damage a repository. The mutating group destroys uncommitted work (`git_discard`) and writes history (`git_commit`), so enabling it is a deployment decision. Registration follows enablement, not availability: an enabled tool stays visible when no backend is usable and fails with a structured `GitError`, so plugin load order and machine state never enter the model-facing schema.

## Alternatives considered

**Let the model use `bash` for Git.** Rejected. The model would parse unbounded CLI text, the harness could not cap diff or log output, arguments would be shell-interpreted, and no UI could render the result as anything but a terminal card. The split between shipped reads and opt-in mutations is also inexpressible through a shell tool.

**Use a JavaScript Git implementation (`isomorphic-git`, `nodegit`).** Tempting: structured results, no binary on PATH, no output parsing. Rejected because this seam's value is agreeing with the user's own `git`. The index format, rename detection, `.gitattributes`, and worktree resolution are where a reimplementation drifts, and it drifts again at every Git release. The cost paid is parsing text and depending on a binary.

**A sibling `conversation.view` tab instead of a panel inside the editor.** Rejected. It would duplicate the file tree, the buffer, and the session, split reviewing from editing, and require an exception to the cross-package import rule to reach the shared Monaco loader.

**One merged status word per file.** Rejected. Git's two facts are what let a UI offer stage and unstage on the same row and let a model know what a commit would contain.

**Prune discovery at the first `.git`.** Rejected. Submodules and vendored checkouts are exactly the nested repositories a reviewer needs; they are reported and marked instead.

**Probe every discovered directory with `git rev-parse`.** Rejected: one process per candidate directory. Discovery reads the filesystem for a `.git` entry of either kind — a *file* is how a submodule and a linked worktree record themselves, so testing for a directory alone would miss them.

**Ask for each worktree's status separately from the client.** Rejected. The counts are the reason the list is worth drawing, and one call per row makes the common case (a monorepo with several checkouts) pay N round trips for one question.

**Detect merge conflicts by attempting a real merge.** Rejected outright: it mutates the working tree and can leave conflict markers behind. `merge-tree --write-tree` answers the same question in the object database.

**Warn whenever the branch diverges at all.** Rejected. Being ahead is the normal state of work in progress; warning on it trains people to ignore the banner. Only `behind > 0` threatens a push.

**Route every commit through the agent.** Rejected as the sole route, though it remains available. A commit on the working tree a person is looking at is their own gesture, the same standing as saving a file in the editor beside it; forcing a model turn for it is friction without a matching guarantee. The logged route is offered alongside rather than instead.

**Ship the mutating tools enabled.** Rejected. `git_discard` destroys uncommitted work; a default that can do that without the deployment saying so is the wrong side of the safe-default line.

## Testing

Each layer is pinned at its own boundary, and the provider layer runs against **real repositories** created per test rather than a scripted CLI: `git` is present on any machine that builds this repository, and a stub could only prove the provider passes the argv the test already assumed.

`git-local` covers the three framing rules above against recorded output, plus real-repository coverage of renames with spaces and non-ASCII names, binary files, unborn branches, worktrees (linked, detached, locked, prunable, and asking from inside a linked checkout), base comparison including a real conflict, and graph topology including merges and truncation. The conflict test also asserts the working tree is unchanged afterwards.

The `git.*` domain proves both fences **by rejection through the domain method**, not by inspecting a schema: a repository outside every registered workspace and a path outside its repository are refused on every row, including each mutating one separately, because each is separately reachable.

`lanes.ts` has its own suite for topology — linear, independent tips, merges, octopus merges, roots, and the leftward collapse — which is what caught the original rightward-drift defect.

`tool-git` covers group-driven registration, disposal, and a structured seam error reaching the model while the tool stays registered, through the real tool registry and a real `ctx.git`.

## Consequences

**Staging is per file, not per hunk.** `git.stage` takes paths; a hunk protocol has no consumer yet, and the whole-file contents `git.diff` returns would support one when it does.

**The panel does not refresh on its own.** A change made outside it — the agent editing a file — appears when the repository is reselected or an action settles, because the host publishes no repository-change event.

**One recovery id is offered at a time.** Discarding twice before dismissing leaves the first id reachable only through the object database.

**No merge, rebase, branch, stash, or remote operations.** Each is a state machine with its own lifecycle and abort points, or reaches credentials; `GitChangeKind.conflicted` and the `ahead`/`behind` counts report those states without offering to resolve them.

**Committing from the panel writes without a session event.** The stated exception above; the agent route exists for anyone who needs the trail.

**A status costs three CLI invocations.** Status plus both numstat sides, so a pathological repository can take up to three times the configured read timeout.

**Discovery reads the filesystem, not `git`.** A repository whose `.git` is present but corrupt is discovered and fails on first use — the honest order, given the alternative is a process per candidate directory.
