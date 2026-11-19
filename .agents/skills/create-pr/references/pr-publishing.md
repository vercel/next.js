# PR publishing rules

Use these rules when drafting, editing, or publishing an ordinary Next.js PR,
a backport, or a stack layer. Fork adoption uses the
[adoption workflow](fork-adoption.md) and preserves the contributor's body.

## Who writes the description

Check both the head and base repositories. For an internal branch PR within
`vercel/next.js`, you may write the full description. External contributions
targeting `vercel/next.js` must have descriptions written by their contributors,
as required by the [pull request template](../../../../.github/pull_request_template.md).

For an external fork PR, explain the policy and offer to review the user's
description, translate it to English, or provide technical details. You can
provide the GitHub URL so the contributor can open the PR with their own text.

## What to include

Read the pull request template before writing a body. Keep the description
short and understandable outside the team.

- In `### What?`, explain what changed from the user or developer perspective.
  Include `### Why?` unless the motivation is obvious, and use `### How?` when
  implementation details would help explain the diff.
- Link known GitHub issues with `Fixes #<number>` and known Linear issues with
  `Closes NEXT-<number>`. When linking a Slack thread, state what was decided.
- Always include `### Verification`. List relevant passing checks and manual
  verification. Name relevant checks you skipped and explain why. Omit routine
  commands CI already covers. If a test changed, omit the command that simply
  runs that test, but list existing tests that verified behavior did not change.
- Omit the template's comment and checklists. End with the disclosure marker
  `<!-- NEXT_JS_LLM -->`. Do not add generated-tool or co-author footers.

Open PRs as drafts and leave them in draft for the user to mark ready. If the
user asks for explanatory review comments, follow the
[GitHub comment policy](../../../../AGENTS.md#github-issues-comments-and-discussions).
