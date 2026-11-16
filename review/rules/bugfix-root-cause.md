# Bugfix root cause

rule: A bugfix's description names the root cause, not just the symptom, and the diff fixes that cause.

severity: escalate (strong). Hedged wording on its own is a comment; the strong finding is a missing or unverifiable cause.

## Signs in review

- Check it, don't just read it: name the file and line the description blames, and confirm the diff changes that code (or explains why the fix lives elsewhere). If you can't, that's the finding.
- The description restates the symptom ("fixes hydration error on /foo") with no "because"
- A confident, detailed cause that doesn't match the diff: the cause is in one place, the change is somewhere else
- Hedged causes ("probably", "seems to", "this should fix it"): comment, unless the cause also can't be found

## Example

Bad:

> Fixes the flash of the old page on back navigation. Seems like a timing issue; deferring the update fixes it.

Good:

> On back navigation, the router restored scroll before the bfcache entry was committed, because scroll restoration ran in the same task as the history pop. The new test navigates back and asserts the scroll position after the old page's content is gone; it fails on canary.

## Why

The description is the historical record. "Seems to fix it" means nobody knows why it broke, so nobody knows whether it's fixed.

See also: [bugfix-regression-test](bugfix-regression-test.md), [no-symptom-patches](no-symptom-patches.md).
