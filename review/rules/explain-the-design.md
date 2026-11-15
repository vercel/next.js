# Explain the design

rule: Comments explain the algorithm and design wherever the code doesn't show them. They describe the code as it is now, not the change that introduced it.

severity: comment

## Signs in review

- New non-obvious logic (ordering, caching, concurrency) with no comment on why
- Comments that restate the line below instead of explaining it
- Comments that only make sense next to the diff: "now we…", "changed to…", "instead of the old…", "this PR", "fix for #1234" with no explanation. The history belongs in the PR description and the commit.
- Code that looks wrong, or deliberately departs from a rule here, with no comment saying why. Whenever a change skirts one of these guidelines, a comment at the site is how a later reader (or reviewer) knows it was on purpose.

## Example

Bad:

```ts
// Set the flag
entry.isPartial = true
```

Good:

```ts
// The server omitted dynamic holes from this prefetch, so a navigation
// still needs a dynamic request before it can render the full page.
entry.isPartial = true
```

Bad (only makes sense in the diff):

```ts
// Now we check isPartial here instead of in the reducer
if (entry.isPartial) {
```

Good (still true a year from now):

```ts
// Partial entries can't satisfy a navigation on their own. Checked here,
// not in the reducer, because the reducer also runs for prefetches.
if (entry.isPartial) {
```

## Why

The next person changing this needs to know what would break. They read the code long after the PR, without the diff next to it.
