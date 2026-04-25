# Git Workflow with Graphite

## Overview

Use Graphite (`gt`) instead of git for ALL branch and commit operations in this repository.

## Use `gt` Instead of `git`

All git commands work with `gt`. Always use `gt` instead of `git`:

```bash
gt add <files>       # instead of git add
gt commit            # instead of git commit
gt status            # instead of git status
gt diff              # instead of git diff
# etc.
```

For branch/push operations, use the Graphite-specific commands:

- `gt create <branch-name> -m "message"` instead of `git branch` + `git commit`
- `gt submit --no-edit` instead of `git push`

## Graphite Commands

| Command                                | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `gt add <files>`                       | Stage files for commit                      |
| `gt create <branch-name> -m "message"` | Create a new branch with commit             |
| `gt modify -a --no-edit`               | Stage all and amend current branch's commit |
| `gt checkout <branch>`                 | Switch branches                             |
| `gt sync`                              | Sync and restack all branches               |
| `gt submit --no-edit`                  | Push and create/update PRs                  |
| `gt log short`                         | View stack status                           |

## Creating a New Branch with Changes

**CRITICAL**: Always stage changes BEFORE running `gt create`. The command format is:

```bash
gt add <files>                               # Stage changes FIRST
gt create <branch-name> -m "commit message"  # Then create branch with commit
```

If you run `gt create` without staged changes, it creates an empty branch with no commit. Then `gt modify -a --no-edit` will fail because there's no commit to amend.

**If you accidentally created an empty branch:**

```bash
gt add <files>
gt commit -m "commit message"    # Create initial commit
gt submit --no-edit              # Then submit
```

## Creating PRs with Descriptions

All PRs require a description. Use this workflow:

```bash
gt submit --no-edit
gh pr edit <pr-number> --body "Place description here"
```

## Safety Rules

- Graphite force-pushes everything - old commits only recoverable via reflog
- Never have uncommitted changes when switching branches - they get lost during restack
- Never use `gt stash` with Graphite - causes conflicts when `gt modify` restacks
- Never use `gt checkout HEAD -- <file>` after editing - silently restores unfixed version
- `gt modify --no-edit` with unstaged/untracked files stages ALL changes
- `gt sync` pulls FROM remote, doesn't push TO remote
- `gt modify` restacks children locally but doesn't push them
- Always verify with `gt status -sb` after stack operations

## Safe Multi-Branch Fix Workflow

```bash
gt checkout parent-branch
# make edits
gt modify -a --no-edit        # Stage all, amend, restack children
gt show HEAD -- <files>       # VERIFY fix is in commit
gt submit --no-edit           # Push immediately

gt checkout child-branch      # Already restacked from gt modify
# make edits
gt modify -a --no-edit
gt show HEAD -- <files>       # VERIFY
gt submit --no-edit
```

## Checklist for Creating a PR

1. [ ] Stage changes: `gt add <files>`
2. [ ] Create branch with commit: `gt create <branch-name> -m "message"`
3. [ ] Push and create PR: `gt submit --no-edit`
4. [ ] Add PR description using `.github/pull_request_template.md` format: `gh pr edit <pr-number> --body "..."`

## General Safety Checklist

- [ ] Always use `gt` instead of `git`
- [ ] No uncommitted changes before switching branches
- [ ] Verify with `gt status -sb` after stack operations
