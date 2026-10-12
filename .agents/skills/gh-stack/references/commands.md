# Command behavior

`gh stack <command> --help` is authoritative for flags and arguments. (`gh stack help <command>` only prints the top-level help.) This file only covers behavior `--help` does not
explain: preconditions, side effects, atomicity, and failure modes.

## Contents

- [init](#init)
- [add](#add)
- [push](#push)
- [submit](#submit)
- [link](#link)
- [sync](#sync)
- [rebase](#rebase)
- [view](#view)
- [checkout](#checkout)
- [unstack](#unstack)
- [merge](#merge)
- [Navigation](#navigation)

## init

Creates the stack and checks out the **last** branch in the list, so a single `init` can lay down
the whole chain: `gh stack init auth api frontend`.

`init` processes branch arguments from bottom to top. Existing branches are adopted. If the first
branch does not exist, it is created from the trunk; each later new branch is created from the
branch immediately before it. There is no separate adopt mode — existence decides. `--base`
selects a non-default trunk.

`init` also enables `git rerere`. Under a TTY the first run in a repo asks for confirmation; set
`git config rerere.enabled true` beforehand to skip it.

## add

- **Must run from the top branch** of the stack (or the trunk when the stack is still empty).
  Anywhere else it exits **5** with `can only add branches on top of the stack`. Run `gh stack top`
  first.
- **Uncommitted changes carry over.** Without `-Am`, `add` does not touch the working tree, so
  staged and unstaged changes follow you onto the new branch. Commit or stash first for a clean start.
- **`add -Am` commits in place when the current branch has no commits yet** — for example
  immediately after `init` — instead of creating a branch. This is deliberate: the first layer
  usually needs its content before a second layer exists.
- `-A` and `-u` are mutually exclusive, and both require `-m`.

## push

Pushes every active (non-merged, non-queued) branch in one multi-ref push with per-branch
`--force-with-lease`.

**Not atomic.** Some branches may update while another is rejected. A rejection means that branch
moved on the remote; fix that branch and rerun — rerunning is safe and skips what already landed.

`push` never creates or updates pull requests. Use `submit` for that.

## submit

Pushes each active branch, then creates a PR for every branch that lacks one, basing it on the
first non-merged ancestor, then links them into a Stack on GitHub.

- **Not atomic.** Branches are pushed sequentially with per-branch `--force-with-lease`. If a later
  push is rejected, earlier pushes and PR updates stand. Fix the rejection and rerun the same command.
- **A fully merged stack cannot be extended.** When every PR in the current stack is already merged,
  `submit` forks the remaining unmerged branches into a **new** stack rooted at the trunk and creates
  it on GitHub, leaving the merged stack untouched.
- **Title generation with `--auto`:** a branch with a single commit uses that commit's subject as
  the title and its body as the PR body. A branch with multiple commits humanizes the branch name
  (hyphens and underscores become spaces). There is no flag for a custom title or body; use
  `gh pr edit` afterwards.
- `--open` marks new _and existing_ PRs ready for review; without it new PRs are drafts.
- Requires stacked PRs to be enabled on the repository. If not, `submit` exits **9** when
  non-interactive (under a TTY it offers to create ordinary unstacked PRs instead).

## link

Creates or updates a stack on GitHub **without any local tracking state**. This is the path for
branches managed by another tool or living in another worktree — see `troubleshooting.md`.

- Arguments are given bottom to top. Each is a branch name or a PR number; a numeric argument is
  tried as a PR number first and falls back to a branch name.
- **A numeric first argument is treated as a stack number only when a stack with that number
  exists.** In that case the remaining arguments are appended to the top of that stack and you do
  not re-list its current PRs: `gh stack link 7 feature-c`. Arguments already in the stack are
  skipped; arguments belonging to a different stack are rejected.
- Branch arguments are pushed automatically (non-force, atomic). Missing PRs are created with
  auto-generated titles and correctly chained bases; existing PRs with a wrong base are corrected.
- Stack membership is **additive only** — `link` never removes a PR from a stack.

## sync

The routine command. Steps, in order:

1. **Fetch** from the remote.
2. **Reconcile with the GitHub stack.** PRs added to the stack on github.com are pulled down and
   appended locally. On divergence, aborts when non-interactive (see `troubleshooting.md`).
3. **Fast-forward the trunk.** Skipped when already current; warns when diverged.
4. **Cascade rebase when needed.** This runs if the trunk moved, a stack branch was fast-forwarded
   from its remote, or a branch no longer contains its expected parent. Merged PRs are handled
   automatically. On conflict, **all branches are restored** to their pre-rebase state and the
   command exits **3**.
5. **Push** all active branches, atomically.
6. **Refresh PR state** from GitHub.
7. **Sync the stack object** — link open PRs into a stack, additively. Only when two or more PRs
   exist. `sync` never opens PRs; that is `submit`.
8. **Prune** local branches for merged PRs, only when `--prune` is passed in a non-interactive
   environment.

## rebase

Pulls from the remote and cascade-rebases. Use it when `sync` reported a conflict or when you need
to rebase only part of the stack.

- `--upstack` rebases from the current branch to the top. This is what you run after editing a
  lower layer.
- `--downstack` rebases from the trunk to the current branch.
- `--no-trunk` skips fetching and the trunk rebase entirely, aligning stack branches with each
  other only.
- `--continue` after staging resolutions; `--abort` restores every branch.
- A merged PR is detected automatically and replayed with `--onto` against the correct target, so a
  squash-merged parent does not produce spurious conflicts.
- Starting a rebase while one is in progress exits **7**.

## view

- `--json` writes the machine-readable payload to stdout. Its schema is in `SKILL.md`.
- Bare `view` opens a full-screen TUI when stdout is a TTY, and prints static text when piped.
- `--short` prints a compact one-line-per-branch summary and never opens the TUI, but it is
  formatted for humans; parse `--json` instead.
- `view` refreshes PR state from GitHub as a side effect, best-effort — it does not fail when the
  API is unreachable.

## checkout

Accepts a stack number, PR number, PR URL, or branch name.

- A bare number resolves as a **stack number first**, then a PR number, then a branch name.
- Stack numbers, PR numbers, and PR URLs fetch from GitHub, pull the branches down, and set the
  stack up locally.
- A **branch name resolves against locally tracked stacks only** and never contacts GitHub. Use a
  stack or PR number to pull a stack that is not tracked locally.
- If a local stack already exists over those branches with a different composition, `checkout`
  cannot be forced past it. Run `gh stack unstack --local` first, then retry.
- `checkout` has no flags. It relies on `remote.pushDefault` when several remotes exist.

## unstack

Removes the stack **grouping** only. It never deletes pull requests or branches.

- With no argument it targets the active stack — the one containing the current branch — removing
  it on GitHub and locally.
- With a stack number it works from anywhere in the repository, tracked locally or not, via the API.
  Local tracking is also removed when present.
- `--local` removes local tracking only and never contacts GitHub. Combining `--local` with a stack
  number that is not tracked locally is an error.
- An unknown stack number exits **2**.

## merge

- Scope with an argument: pass a PR number to merge that PR and every unmerged PR below it in the
  stack, or pass a stack number to merge every unmerged PR in that stack.
- **All-or-nothing.** If any PR in that exact merge set cannot be merged, none are, and the reason
  is reported.
- The method comes from `--squash`, `--rebase`, `--merge`, or `--merge-method <method>`. Without
  one, the last-used method is reused.
- Only basic PR state is checked before merging: open and not a draft. Bypassing merge requirements
  is not supported for stacks.
- **A merge queue on the base branch overrides everything.** The stack is added to the queue rather
  than merged; the queue chooses the method and any method flag you passed is ignored with a
  warning. Queued PRs are submitted together but land as the queue processes them, so they may merge
  in separate groups rather than all at once.
- `gh pr merge` cannot merge a stack. Always use `gh stack merge`.

## Navigation

`up`, `down`, `top`, `bottom`, and `trunk` are always non-interactive. `up` and `down` accept a
count (`gh stack up 3`). Movement clamps at the stack bounds, and merged branches are skipped when
navigating from an active branch, so `bottom` lands on the lowest _unmerged_ branch.

`gh stack switch` is a selection menu with no non-interactive path. Use the commands above instead.
