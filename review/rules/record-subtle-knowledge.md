# Record subtle knowledge in the code

rule: Subtle knowledge goes in the codebase, at the place where the next person to change the code will see it. That includes open design questions, known gaps, and the reason a non-obvious constraint exists. Don't leave it only in a PR thread, an issue, or Slack.

severity: nit

## What belongs in the code

- An open question the PR deliberately didn't answer, and what would answer it
- A known gap or edge case the code doesn't handle yet
- A constraint that isn't visible from the code, e.g. "this must run before X because Y"

What doesn't: the PR's back-and-forth, or who decided what. That stays in the PR.

## Signs in review

- A review thread resolves a subtle question ("this is only safe because…", "we should revisit when…"), and nothing in the diff records the answer
- The description lists open questions or follow-ups that appear nowhere in the code
- A vague `TODO` with no question in it: `// TODO: fix`, `// TODO: clean up`

## Example

Bad: the PR description says "Follow-up: this refetches on every window focus. Not sure that's right for apps with long `staleTimes`", and the code has no trace of it.

Bad: `// TODO: revisit`

Good:

```ts
// TODO: This refetches on every window focus, regardless of staleTimes.
// That's right for the default (staleTimes.dynamic = 0), but an app that
// sets a long dynamic stale time probably expects focus to respect it.
// Open question: should focus refetch be skipped while the entry is fresh?
// Revisit once the segment cache tracks per-entry stale times.
window.addEventListener('focus', refetchVisibleSegments)
```

## Why

The code is the one place the next person is guaranteed to look. A PR thread is gone from view once the PR merges, and an issue gets closed or forgotten. A note at the code site stays where the decision lives and moves with the code.

A specific question is worth recording even if it's never answered. A vague `TODO` isn't worth recording: nobody can act on it.
