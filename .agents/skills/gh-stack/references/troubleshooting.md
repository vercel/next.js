# Troubleshooting and recovery

## Contents

- [Rebase conflicts (exit 3)](#rebase-conflicts-exit-3)
- [After a squash merge](#after-a-squash-merge)
- [Local and remote stacks have diverged](#local-and-remote-stacks-have-diverged)
- [Restructuring a stack](#restructuring-a-stack)
- [Branch belongs to several stacks (exit 6)](#branch-belongs-to-several-stacks-exit-6)
- [Driving stacks from another tool or worktree](#driving-stacks-from-another-tool-or-worktree)
- [Stack file is locked (exit 8)](#stack-file-is-locked-exit-8)
- [An interrupted modify session (exit 10)](#an-interrupted-modify-session-exit-10)

## Rebase conflicts (exit 3)

`rebase` and `sync` both exit 3 on conflict. `sync` restores every branch to its pre-rebase state
first, so a failed `sync` leaves nothing half-applied; a failed `rebase` stops mid-flight and waits.

```bash
gh stack rebase
# exit 3 — conflicted paths are listed on stderr
git add <resolved paths>
gh stack rebase --continue     # repeat if the next branch also conflicts
```

`gh stack rebase --abort` restores every branch in the stack, not just the current one.

Because `init` enables `git rerere`, a conflict you resolve once is replayed automatically the next
time the same conflict appears — which is common, since a change low in the stack is rebased through
every branch above it. Without `rerere`, repeated conflicts may need manual resolution on each
affected layer.

## After a squash merge

A squash merge replaces the branch's commits with one new commit, so the originals no longer exist
in the trunk's history and an ordinary rebase would try to replay them again.

`gh stack sync` detects this and rebases with `--onto` against the correct target, skipping the
merged branch:

```bash
gh stack sync
gh stack view --json    # merged branch reports "isMerged": true, "state": "MERGED"
```

No manual action is needed. If the replay conflicts, `sync` restores all branches and exits 3.
Run `gh stack rebase` to rerun the rebase, which will stop at the conflict and allow you to resolve
and then `--continue` until complete. Use `gh stack sync --prune` to also delete local branches for
merged PRs.

## Local and remote stacks have diverged

Divergence means the local stack and the stack on GitHub changed in different ways — for example
branches were added locally while a PR was added to the stack on github.com.

When non-interactive, `sync` prints both chains, changes nothing, and exits **0** with
`Sync aborted`. Success here does not mean the sync happened; check for that message, or re-run
`gh stack view --json` and compare.

Two resolution paths:

- **Keep the remote version.** Drop local tracking and pull the stack back down.

  ```bash
  gh stack unstack --local          # keeps the stack on GitHub
  gh stack checkout <stack-number>  # or a PR number
  ```

- **Keep the local version.** Remove the grouping on GitHub, then recreate it from local state.

  ```bash
  gh stack unstack                  # removes the grouping; PRs and branches survive
  gh stack submit --auto
  ```

Neither path deletes pull requests or branches.
Remote unstacking leaves PRs that are merging (auto-merge enabled) or are queued (in a merge queue)
stacked. If needed, clear that state before retrying.

## Restructuring a stack

There is no non-interactive reorder, rename, or removal. `add` run from the wrong branch suggests
`gh stack modify`, but that is TUI-only. Tear the stack down and rebuild it instead:

```bash
gh stack unstack                       # removes local tracking and the GitHub grouping
# Rename or drop branches, and rewrite ancestry as needed.
gh stack init --base main branch-1 branch-2 branch-3
gh stack submit --auto                 # re-link on GitHub
```

`init` adopts branches that already exist, so the rebuild reuses them rather than creating new ones.
Existing PRs survive. Once Git ancestry is correct, `submit` updates their base branches and
re-links the stack on GitHub.

Changing metadata does **not** change Git ancestry. Reorder commits first, then rebuild the stack.
For example, to change `main <- models <- migration <- ui` into
`main <- migration <- models <- ui`:

```bash
old_models=$(git rev-parse models)
old_migration=$(git rev-parse migration)
git rebase --onto main "$old_models" migration
git rebase --onto migration main models
git rebase --onto models "$old_migration" ui
gh stack unstack
gh stack init --base main migration models ui
```

The first rebase moves migration-only commits onto trunk, the second replays model commits above
them, and the third replays UI-only commits above models. Preserve the old boundary SHAs before
moving any branch. For a different reorder, identify each layer's range with
`git log <old-parent>..<branch>`, then replay the ranges bottom to top.

## Branch belongs to several stacks (exit 6)

Commands exit 6 when the current branch cannot identify a single stack — typically because it is the
trunk of more than one stack. There is no flag to disambiguate.

```bash
gh stack checkout <a-branch-unique-to-the-intended-stack>
```

Then rerun. Commands that take an explicit stack number (`merge 7`, `unstack 7`) sidestep the
problem entirely, since they do not infer the stack from the current branch.

## Driving stacks from another tool or worktree

`gh stack link` creates and updates stacks purely through the API, with no local tracking state.
Use it when branches are managed by jj, Sapling, git-town, a separate worktree, or any workflow
where the local `.git/gh-stack` file would be wrong or absent.

```bash
gh stack link branch-a branch-b branch-c        # bottom to top
gh stack link --base develop --open a b c       # non-default trunk, ready for review
gh stack link 10 20 30                          # by PR number
gh stack link 7 feature-d                       # append to existing stack #7
```

Because `link` writes no local state, the local navigation commands (`up`, `down`, `top`, `bottom`)
will not work on the result. Use `gh stack checkout <stack-number>` if you later want local tracking.

## Stack file is locked (exit 8)

Another `gh stack` process holds the exclusive lock on `.git/gh-stack.lock`. The lock times out
after about five seconds, so wait and retry. A persistent exit 8 means another process still holds
the lock; identify and stop that process before retrying.

## An interrupted modify session (exit 10)

`gh stack modify` is TUI-only and should never be invoked by an agent. If a repository is left in
this state by someone else, restore it:

```bash
gh stack modify --abort
```

Related: `submit` also detects a pending modify state, and under a TTY asks before overwriting the
stack on GitHub with local state.
