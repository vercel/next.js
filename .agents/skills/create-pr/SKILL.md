---
name: create-pr
description: >
  Create Git branches, commits, pushes, and GitHub pull requests for Next.js.
  Use when the user asks to create a branch, commit current changes, open a
  PR or draft PR, publish a pull request, or recover from gh pr create / PR
  template issues. Covers .github/pull_request_template.md, --body formatting,
  NEXT_JS_LLM_PR, codex/ branch names, and Codex app git directives.
metadata:
  internal: true
---

# Create PR

Use this skill when turning local work into a GitHub pull request.

## Workflow

1. Inspect the current state before mutating Git:

   ```bash
   git status --short
   git branch --show-current
   git diff -- <paths>
   ```

   Stage only files that belong to the requested change. Preserve unrelated
   user changes.

2. Create or confirm the branch:

   ```bash
   git switch -c codex/<short-topic>
   ```

   Use the `codex/` prefix unless the user asks for a different name. If a
   `.git/*lock` or `Operation not permitted` error appears, rerun the same Git
   command with sandbox escalation. Do not assume a branch namespace conflict
   until checking refs with `git branch --list`, `git show-ref`, or
   `git for-each-ref`.

3. Validate and commit:

   ```bash
   git add <paths>
   git diff --cached --check
   git commit -m "<concise message>"
   ```

   Keep commit messages concise and do not add generated-tool or co-author
   footers.

4. Push the branch:

   ```bash
   git push -u origin <branch>
   ```

5. Create the PR as a draft unless the user explicitly asks otherwise:

   ```bash
   gh pr create --draft --base canary --head <branch> --title "<title>" --body '<body>'
   ```

   For this repo, prefer `canary` as the base branch. If GitHub network access
   fails in the sandbox, rerun with escalation.

## PR Body

Use this PR body format:

```markdown
### What?

<what changed>

### Why?

<why this is needed>

### How?

<implementation approach>

### Verification

- `<command that passed>`
- Not run: `<command>` (`<reason>`)

<!-- NEXT_JS_LLM_PR -->
```

Use `--body` with this filled content.

## Recovery

- If a PR may already exist, check before creating a duplicate:

  ```bash
  gh pr view --head <branch> --json url,isDraft,title
  ```

- If approval is denied for `gh pr create`, report that the branch is pushed
  but the PR was not created, and provide the exact corrected command.
- After successful Codex app Git actions, include the appropriate final-response
  directives for branch creation, staging, committing, pushing, and PR creation.

## Related Skills

- `$pr-status-triage` - Analyze CI failures and PR review feedback after the PR exists.
- `$gh-stack` - Manage stacked branches and dependent pull requests.
