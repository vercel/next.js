# No stale docs

rule: Docs, comments, and skills preserve the conditions and safeguards that make their advice correct.

severity: for docs, skills, and other agent instructions, escalate (medium) for guidance that would lead to incorrect implementation or validation; escalate (strong) for substantial loss of decision branches, fixes, caveats, or examples with no verified replacement, or changes to agent activation, permissions, consent, or stopping conditions; comment otherwise

The escalation tiers apply to documentation, skills, and other agent instructions. Stale comments in source code remain comment-only. Incorrect guidance within a documented code example is still documentation. Comment-level findings under this rule never count toward accumulation.

## Signs in review

- A comment above changed code that still describes the old behavior
- A renamed or removed function still named in comments, `README.md`, `AGENTS.md`, or a skill
- Docs under `docs/` for an option whose default changed
- A warning, prerequisite, validation step, or restriction removed without evidence that the advice remains correct
- A skill or other agent instruction changes when the agent acts, what it may do, when consent is required, or when it must stop
- A condition removed or misstated: production vs. development, rendering vs. other execution, runtime, router, version, or required flag
- Prose, headings, snippets, expected output, or related pages giving incompatible instructions
- An example or recommended fix that doesn't work in the mode it claims to address
- Migration advice that removes configuration or replaces an API without explaining the behavior change and how to validate it
- A deletion or rewrite that drops decision branches, fixes, caveats, or examples without showing where the guidance went

## How to apply

- A medium finding can be dismissed only with evidence that the advice is correct for its stated conditions. A reason for leaving known incorrect advice in place does not waive the finding. This takes precedence over the general allowance for a justified medium.
- Check changed claims against the implementation and relevant tests. A docs correction can describe existing behavior without a code change in the same PR.
- Compare examples with their prose and expected output. Check the mode the advice targets; success in `next dev` doesn't establish that a build-time fix works.
- Follow related references when the changed claim would leave conflicting advice. Cite the affected lines and the implementation or related page that contradicts them.
- For substantial deletions or rewrites, compare the removed guidance with its replacement. A move or consolidation that preserves the decisions and safeguards doesn't escalate for size. If meaningful guidance has no verified replacement, request human review and name what was lost; don't invent a runtime bug to justify escalation.
- Apply the same review to skills and other agent instructions. Changes to activation, permissions, consent, or stopping conditions require human review because they change what an agent will do. Explain that behavioral difference; a typo fix or rewording that preserves it is advisory.
- Size prompts a closer look, not a verdict. A one-word change can alter correctness. Wording, repetition, section order, and presentation remain advisory when they preserve meaning.
- These severities apply even when the author owns the area. They take precedence over treating stale docs as style feedback. Security concerns follow the separate policy in [REVIEW.md](../../REVIEW.md#security-is-out-of-scope).

## Example (comment-only)

Bad: changes the default from 0 to 30 and leaves `// Defaults to 0, so dynamic pages always refetch` above it.

Good: the comment changes with the code.

## More examples

- Bad: removes "with Cache Components enabled" from advice whose implementation is gated by that flag. Good: retains the condition or verifies that it no longer applies.
- Bad: calls disabling a validation check "opting out of prerendering" when prerendering still occurs. Good: distinguishes validation from rendering behavior and checks the relevant implementation.
- Bad: replaces a migration step without mentioning the prefetched UI it stops preserving. Good: explains the behavior change and how to validate the intended UI before and after migration.
- Bad: deletes a troubleshooting page's alternate fixes and caveats with no replacement. Good: maps each still-relevant case to its replacement section, or escalates the removal for human review.
- Bad: treats a skill changing "ask before publishing" to "publish after validation" as a wording edit. Good: requests human review because the agent would now publish without consent.

## Why

Humans and agents implement what the docs recommend. Incorrect or incomplete guidance can change application behavior even when the PR changes no runtime code.
