# Behavior over convenience

rule: A change to what users observe is argued from the intended behavior, not from what's easier to build.

severity: comment

## Signs in review

- "Since the code already...", "it's simpler if..." as the reason for a behavior
- A behavior change with no alternative considered

## Example

Bad:

> Errors in `generateMetadata` now render the root error boundary, since that's where the existing catch is.

Good:

> Errors in `generateMetadata` should render the nearest error boundary, like errors in the page. The existing catch is at the root, so this moves it.

## Why

Simplicity is a tiebreaker, never the argument for a behavior.
