---
name: prepare-team-meeting
description: >
  Prepare a team meeting summary of recent pull requests: every PR a set of
  authors merged in the last N days, plus their open and draft PRs updated in
  that window. PRs are grouped into categories with one owner each, flagged
  merged / open / draft, linked, and given a one-line benchmark summary taken
  from the PR description. Use when asked for a weekly PR summary, team
  update, meeting notes, a "what did the team ship" report, or a summary of
  PRs by a team or a list of users. Uses scripts/fetch-prs.mjs and `gh search prs`.
argument-hint: '<github-logins> [days]'
---

# Prepare Team Meeting

Use this skill when the user asks for a summary of a team's recent PRs, for
example to prepare a team meeting or a weekly update.

## Inputs

- **Authors**: the GitHub logins whose PRs to include. If the user names a
  team ("the Turbopack team") and doesn't list logins, ask which logins belong
  to it. Don't guess team membership.
- **Window**: the number of days back. The default is 7.
- **Repo**: the default is `vercel/next.js`.

## Steps

1. **Fetch the PRs.** This writes `prs.json`, `index.md` and `bodies/*.md`
   to the output directory:

   ```bash
   node .agents/skills/prepare-team-meeting/scripts/fetch-prs.mjs \
     --authors <login1,login2,...> --days 7 --out /tmp/team-meeting
   ```

2. **Extract benchmark numbers.** Read each `bodies/NN.md` chunk, using a
   cheaper sub-model or a file-query tool when one is available, with this
   prompt:

   > For EVERY PR section (starting with "=== PR #"), output exactly one line:
   > "#<number>: <benchmark summary>". The summary is one concise line of the
   > concrete measured performance or benchmark numbers in the description
   > (e.g. "−12% build time, −300 MB peak memory on large app"), or "none" if
   > it reports no measured numbers. Only use numbers that are in the text.
   - Only keep **performance** measurements: time, CPU, memory, size,
     throughput.
   - Drop test pass counts and flake-rate counts.
   - Keep regressions as well as wins, e.g. "+5% RSS".
   - In `index.md`, 📊 marks the descriptions that contain numbers.

3. **Pick categories using `index.md`.** Follow these rules:
   - **Group by category first.** Within a category, list PRs as merged, then
     open, then draft.
   - **One owner per category.** Put the owner in the heading:
     `## 3. Persistence: @user`.
   - **Two owners only for shared work:** both people worked on the _same_
     PR, e.g. co-authored commits. Check with
     `gh pr view <n> --json commits --jq '.commits[].authors[].login'`.
     Two people working on the same topic is not enough.
   - If a topic has PRs from several people, **split it** into one category
     per owner, e.g. "Analyzer: @a" and "Analyzer performance: @b".
   - Name categories by subsystem or theme, such as "turbo-tasks backend",
     "Chunking and output" or "Dev server and HMR". Don't name them after the
     PR status.

4. **Write the document** in the format below, then check it against the
   checklist.

## Document format

```markdown
# <Team> PRs: <start date>–<end date>

Legend: ✅ merged · 🔄 open · 📝 draft. **Totals:** <n> ✅ · <n> 🔄 · <n> 📝

## 1. <Category>: @owner

- ✅ <What changed, in a few words> [#12345](https://github.com/vercel/next.js/pull/12345)
  - 📊 −25% warm build wall time, −1.2 GiB peak RSS on large-app
- 🔄 <Several related PRs in one bullet> [#12346](…) [#12347](…)
- 📝 <...> [#12348](…)
```

- Link every PR number: `[#N](https://github.com/<repo>/pull/N)`.
- Put `@` in front of every GitHub user name.
- Group related PRs into one bullet with several links, so the document stays
  short.
- Add a `📊` sub-bullet only when a PR reports measured numbers. Keep it to
  one line with the 1–3 most important numbers and the setup they were
  measured on.
- Leave out benchmark-free noise, such as test-only pass counts.
- **Length:** aim for about 100 lines and never go over 200. Merge bullets
  before you drop PRs.
- Write the document outside the repository checkout, e.g. under `/tmp`, and
  share it for review rather than committing it.

## Checklist

- [ ] Every PR from `prs.json` is linked at least once. Check with a quick
      `grep` of the numbers against the document.
- [ ] The totals in the header match the status counts in `index.md`.
- [ ] Every category heading has exactly one owner, or two who share a PR.
- [ ] Every PR that has numbers in its description gets a `📊` line.
- [ ] The document is no more than 200 lines.

## Related Skills

- `$pr-status-triage`: CI and review status of a single PR.
