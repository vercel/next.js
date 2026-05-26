---
name: backport-pr
description: >
  Backport a merged Next.js pull request from canary to a previous release
  branch such as next-16-2. Use when the user asks to backport, cherry-pick,
  or open a backport PR from a PR number to an older Next.js version. Covers
  finding the merged PR commit, creating a backport branch from the target
  release branch, cherry-picking from canary, validating, and opening the PR
  with the release branch as the base.
metadata:
  internal: true
---

# Backport PR

Use this skill when a user asks to backport a merged Next.js PR to a release
branch.

## Inputs

- Require a PR number and a target release branch, for example `next-16-2`.
- If the target branch is not provided and cannot be inferred confidently from
  the user's request, ask before mutating git state.
- Treat the target branch as variable; do not hard-code `next-16-2` except when
  the user explicitly asks for it.

## Workflow

1. Inspect the current worktree before changing branches:

   ```bash
   git status --short
   git branch --show-current
   ```

   Preserve unrelated user changes. Do not overwrite, reset, or stash them
   without the user's consent.

2. Sync the source and target branches:

   ```bash
   git fetch origin canary:refs/remotes/origin/canary <target-branch>:refs/remotes/origin/<target-branch>
   ```

3. Identify the commit that landed the PR on `canary`:

   ```bash
   gh pr view <pr-number> --repo vercel/next.js --json number,title,state,url,mergeCommit,baseRefName,headRefName
   git log origin/canary --oneline --fixed-strings --grep="(#<pr-number>)"
   ```

   Prefer `mergeCommit.oid` when the PR is `MERGED` and the commit is contained
   in `origin/canary`. If GitHub does not return a usable merge commit, use the
   `git log --grep` result and verify the commit subject references the PR
   number.

4. Create the backport branch from the release branch:

   ```bash
   git switch -c backport-<pr-number>-to-<target-branch> origin/<target-branch>
   ```

   After switching branches in this repo, run `pnpm build-all` before Next.js
   integration tests unless the user explicitly limits the task to preparing the
   cherry-pick or PR.

5. Cherry-pick the landed commit with provenance:

   ```bash
   git cherry-pick -x <merged-commit-sha>
   ```

   Resolve conflicts in favor of preserving the release branch's compatibility
   constraints. If the cherry-pick is empty, verify whether the change is already
   present on the release branch and report that instead of opening a duplicate
   PR.

6. Verify with the narrowest commands that cover the touched files. Prefer
   focused tests, `pnpm types` for TypeScript-only risk, and the relevant
   integration test mode for behavior changes.

7. Open the backport PR using `$create-pr`.

   Override the normal `$create-pr` base branch: use `--base <target-branch>`,
   not `canary`. Keep the PR as a draft unless the user explicitly asks
   otherwise.

## PR Shape

Use a title like:

```text
[backport] <original PR title>
```

Use a concise PR body:

```markdown
Backports <original PR title/link> to `<target-branch>`.

<!-- NEXT_JS_LLM_PR -->
```

## Related Skills

- `$create-pr` - Create the branch commit, push it, and open the draft PR.
- `$pr-status-triage` - Check CI failures or review feedback after the PR exists.
