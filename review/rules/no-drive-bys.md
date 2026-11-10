# No drive-bys

rule: Changes the PR's stated purpose doesn't need, even fixes of real bugs, go in their own PR.

severity: comment. If the extra is a behavior change, it's also [motivated-changes](motivated-changes.md), which escalates.

## Signs in review

- Anything the diff does that the description doesn't mention: a rename, a refactor, a cleanup
- A bug fixed in passing, in a PR about something else
- A diff much larger than the description implies, often a copied block that should reuse existing code

## Example

Bad: "Add `staleTimes.static` validation" that also renames a cache helper across 14 files.

Good: the validation PR, plus a separate PR for the rename.

## Why

Each PR is reviewed, reverted, and bisected as a unit. Unrelated changes make all three harder.
