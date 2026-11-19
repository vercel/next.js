---
name: create-pr
description: >
  Create a branch, commit or push Next.js changes, or open a standalone draft PR.
  Also use to draft or edit a PR title or description, fix `gh pr create` errors,
  or adopt a fork PR with `pnpm pr-adopt`.
metadata:
  internal: true
---

# Create PR

Use this skill for standalone Git and PR tasks. Run only the steps the user
requested or that are needed for the requested outcome.

- When drafting, editing, or publishing a PR, read the [PR publishing rules](references/pr-publishing.md).
- When adopting an external PR into `vercel/next.js`, follow the [fork adoption workflow](references/fork-adoption.md) instead of the workflow below.
- For an LTS backport or work in an existing stack, start with `$backport-pr` or `$gh-stack` respectively.

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
   git switch -c <agent-name>/<short-topic>
   ```

   Prefix the branch with your agent's name as a single lowercase word, such
   as `codex/`, `claude/`, or `fleet/` (e.g. `claude/<short-topic>`), unless
   the user asks for a different name. If a
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

   Before committing, check the affected files using the commands in
   [lint-staged.config.js](../../../lint-staged.config.js). Keep commit messages
   concise. Use the required `<!-- NEXT_JS_LLM -->` disclosure without adding
   other generated-tool or co-author footers.

4. Push the branch:

   ```bash
   git push -u origin <branch>
   ```

5. Create the PR as a draft unless the user explicitly asks otherwise, with
   the body prepared using the publishing rules:

   ```bash
   gh pr create --draft --base canary --head <branch> --title "<title>" --body-file <path>
   ```

   Use a temporary Markdown file for the body. Use `canary` for ordinary PRs
   unless the task calls for a different base. Let the user mark the PR ready
   for review. If GitHub network access fails in the sandbox, rerun with
   escalation.

## Recovery

- If a PR may already exist, check before creating a duplicate:

  ```bash
  gh pr view <branch> --json url,isDraft,title
  ```

- If approval is denied for `gh pr create`, report that the branch is pushed
  but the PR was not created, and provide the exact corrected command.
- After successful Codex app Git actions, include the appropriate final-response
  directives for branch creation, staging, committing, pushing, and PR creation.

## Related Skills

- `$pr-status-triage` - Analyze CI failures and PR review feedback after the PR exists.
- `$gh-stack` - Manage stacked branches and dependent pull requests.
