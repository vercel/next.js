# Docs

<!-- Owners and paths: the [docs] section of review/OWNERS. -->

## Context

- Public documentation in `docs/`, error fixes in `errors/`, examples, contributing and upgrading guides, and docs-authoring skills.
- Review what following the changed advice would make a human or agent implement. A prose-only diff can change behavior.
- Verify claims against the current implementation, including required flags, defaults, runtime, router, version, and development vs. production behavior.

## What failure looks like

- A removed warning or prerequisite makes conditional advice sound universal.
- A snippet omits a safeguard its prose requires, or an error-page fix works in development but fails during build.
- A correction leaves conflicting advice on a related page, or a migration silently changes behavior.
- A rewrite removes useful decisions, fixes, caveats, or examples without preserving them elsewhere.

## Escalate when

- Apply [no-stale-docs](../rules/no-stale-docs.md) to docs and skills for incorrect advice, lost guidance, and changes to what an agent is instructed to do. Its severities apply even when the author owns this area.
- A docs correction needs evidence of the behavior it describes, not necessarily a code change in the same PR. Don't escalate merely because that code was already shipped.
- Size alone doesn't withhold approval. Check what was lost or changed, including in large deletions and consolidations.

## Example

Bad: approves removing "in production" from a caching explanation without checking whether development behaves differently.

Good: compares the advice with the relevant implementation and tests, then raises a medium finding if the omitted condition would lead to incorrect implementation or validation.

## Preferences

- Keep wording preferences, repetition, section order, and minor presentation feedback advisory. Prefer a concrete correctness finding over rewriting in your own style.
