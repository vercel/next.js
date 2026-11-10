# No stale docs

rule: A comment, doc, or skill isn't left describing something the change made untrue.

severity: comment

## Signs in review

- A comment above changed code that still describes the old behavior
- A renamed or removed function still named in comments, `README.md`, `AGENTS.md`, or a skill
- Docs under `docs/` for an option whose default changed

## Example

Bad: changes the default from 0 to 30 and leaves `// Defaults to 0, so dynamic pages always refetch` above it.

Good: the comment changes with the code.

## Why

A wrong comment is worse than none.
