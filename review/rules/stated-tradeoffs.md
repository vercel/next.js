# Stated tradeoffs

rule: Known regressions and tradeoffs are stated in the description, not left for the reviewer to find.

severity: comment

## Signs in review

- A change that makes one case better and another worse, with only the better one described
- A bundle size, build time, or memory increase that isn't mentioned

## Example

Bad: "Inline the prefetch hints into the HTML" with no mention that the HTML grows.

Good:

> Inlines the prefetch hints into the HTML. This adds ~1KB per page for apps with many links; in exchange the first navigation skips a request.

## Why

A tradeoff that's stated can be judged. One that isn't gets found later, as a regression.
