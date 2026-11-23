---
name: rebase-pr
description: >
  Rebase a Next.js PR onto the latest canary, or restack dependent PRs after a
  lower layer changes. Use when a PR conflicts with canary, when asked to
  rebase, restack, or update a branch, when CI fails after a rebase, or when
  using gh stack in vercel/next.js. Covers fetching canary in shallow clones,
  checking that canary is healthy, git rebase --onto, safe force-with-lease
  pushes, tree and ancestry checks, lockfiles, lint, snapshots, and gh stack
  behavior in this repository.
metadata:
  internal: true
---

# Rebase PR

Use this skill when moving a Next.js PR, or a stack of PRs, onto a newer base.
Prefer rebase over merge. Keep the PR's draft state unchanged. For general
`gh stack` commands, see `$gh-stack`.

## Before rebasing

1. Check the current worktree. Don't rebase over unrelated local changes.
2. Fetch the base with an explicit forced refspec:

   ```bash
   git fetch origin +refs/heads/canary:refs/remotes/origin/canary
   ```

3. In a shallow clone, deepen until Git finds a merge base:

   ```bash
   git fetch --deepen=200 origin +refs/heads/canary:refs/remotes/origin/canary
   git merge-base HEAD origin/canary
   ```

   Without a merge base, Git can replay unrelated history and report many
   add/add conflicts. Abort and deepen instead of resolving them.

4. Check canary's own CI at the base commit. If canary is broken in the same
   area, wait for a fix instead of pushing a rebase that can only fail.
5. Review new canary commits in the PR's area:
   `git log <old-base>..origin/canary -- <paths>`. If an equivalent change
   already landed, stop and discuss the new scope with the PR owner.

## Rebase

- Run `git rebase origin/canary`, or use `--onto` for a known old base.
- List all conflicts before classifying them:
  `git diff --name-only --diff-filter=U`. Generated files can hide source
  conflicts in truncated output.
- Resolve conflicts by preserving both intents. Search canary for new callers of
  APIs the PR removes or renames.
- A squash-style rebase rewrites the PR's commit history. Only use it with the
  PR owner's approval and with a backup branch of the old head.
- Re-fetch canary immediately before pushing. If it moved, ask the PR owner
  whether to repeat the rebase. Usually it isn't needed, and repeating it
  automatically can loop.

## Verify

A clean text rebase can still fail CI:

- Run ESLint and TypeScript for changed files, plus the commands for the
  affected package. New canary lint rules can apply to old PR code.
- Compile changed Rust or TypeScript call sites.
- Run tests and snapshots that canary added since the PR's old base. In
  Turbopack, run the relevant full snapshot suite, not only PR-specific
  fixtures.
- After any `package.json` change, update `pnpm-lock.yaml` and run
  `pnpm install --frozen-lockfile`. `--lockfile-only` does not populate
  `node_modules`. Revert unrelated lockfile rewrites.
- Don't commit unrelated generated output from a native rebuild.
- If CI fails after the rebase, use `$pr-status-triage` to compare with canary
  before changing code.

## Push safely

- Pin `--force-with-lease` to the exact remote SHA you inspected:

  ```bash
  git push --force-with-lease=refs/heads/<branch>:<old-remote-sha> origin <branch>
  ```

- If the remote moved, stop and inspect it. Never overwrite another person's
  commits without asking.
- After pushing, check the PR's head SHA, base, draft state, and mergeability.

## Restack dependent PRs

If the PRs form a `gh stack`, restack with `gh stack rebase --upstack` (or
`gh stack sync`). See `$gh-stack` for conflict handling. Afterwards, still check
each layer as in steps 4, 5 and 7 below.

Otherwise, or if the tool fails, restack by hand. Work bottom-up and push one
branch at a time:

1. Commit each change on the layer that owns it. Use history or blame when
   ownership is unclear.
2. Push the lower branch, then fetch its exact remote tip.
3. Rebase the child onto that tip:
   `git rebase --onto <new-parent-tip> <old-parent-tip> <child>`.
4. Check that the child's own changes are unchanged with `git range-diff`.
5. Run formatting, lint, and focused checks on every layer. A mistake in a
   middle layer can fail every layer above it.
6. Push the child with an exact lease. Repeat upward.
7. Verify `git merge-base --is-ancestor <parent> <child>` for remote heads and
   check each PR's mergeability.

## `gh stack` in vercel/next.js

- `gh stack link` needs read access to the repository's PRs and stacks because
  it lists stacks first. Linking is optional. A PR whose base is its parent
  branch already shows the stacked diff.
- `gh stack link` appends PRs to the top of an existing stack.
- GitHub can refuse to change the base of a PR that belongs to a stack. Omit
  `base` when updating only the body.
- `gh stack submit --auto` can warn that it could not create a GitHub stack
  while still creating dependent PRs. Check every PR's base and draft state.
- `gh stack view --json` can lag behind real refs. Confirm with
  `git rev-parse` and `git merge-base`.
- `PR Stack CI Gate` can skip a stacked PR's tests while predecessor PRs are
  red. See `$pr-status-triage`.

## Related Skills

- `$gh-stack` - general stacked-PR commands
- `$create-pr` - branch, commit, and PR creation
- `$pr-status-triage` - CI failures after a rebase
