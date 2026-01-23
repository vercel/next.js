# Git Workflow with Graphite

## Overview

Use Graphite (`gt`) instead of git for ALL branch and commit operations in this repository.

## Forbidden Git Commands

NEVER use these git commands directly:

- `git push` → use `gt submit --no-edit`
- `git branch` → use `gt create`

## Graphite Commands

| Command                                | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `gt create <branch-name> -m "message"` | Create a new branch with commit             |
| `gt modify -a --no-edit`               | Stage all and amend current branch's commit |
| `gt checkout <branch>`                 | Switch branches                             |
| `gt sync`                              | Sync and restack all branches               |
| `gt submit --no-edit`                  | Push and create/update PRs                  |
| `gt log short`                         | View stack status                           |

## Creating PRs with Descriptions

All PRs require a description. Use this workflow:

```bash
gt submit --no-edit
gh pr edit <pr-number> --body "Place description here"
```

## Safety Rules

- Graphite force-pushes everything - old commits only recoverable via reflog
- Never have uncommitted changes when switching branches - they get lost during restack
- Never use `git stash` with Graphite - causes conflicts when `gt modify` restacks
- Never use `git checkout HEAD -- <file>` after editing - silently restores unfixed version
- Always use `gt checkout` (not `git checkout`) to switch branches
- `gt modify --no-edit` with unstaged/untracked files stages ALL changes
- `gt sync` pulls FROM remote, doesn't push TO remote
- `gt modify` restacks children locally but doesn't push them
- Always verify with `git status -sb` after stack operations

## Safe Multi-Branch Fix Workflow

```bash
gt checkout parent-branch
# make edits
gt modify -a --no-edit        # Stage all, amend, restack children
git show HEAD -- <files>      # VERIFY fix is in commit
gt submit --no-edit           # Push immediately

gt checkout child-branch      # Already restacked from gt modify
# make edits
gt modify -a --no-edit
git show HEAD -- <files>      # VERIFY
gt submit --no-edit
```

## Checklist

- [ ] Using `gt` commands instead of `git push`/`git branch`
- [ ] No uncommitted changes before switching branches
- [ ] Verified changes with `git status -sb` after stack operations
- [ ] PR description follows `.github/pull_request_template.md` format
