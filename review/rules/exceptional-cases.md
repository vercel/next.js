# Exceptional cases look exceptional

rule: A rare case gets a path of its own where it differs, instead of widening the general case to fit it.

severity: comment

## Signs in review

- A parameter added to a common function for one of its callers
- A field on every record that only one kind uses
- A boolean threaded through several calls instead of branching once where the decision is made
- A check for a rare case at the top of a hot loop
- A special case that's genuinely needed, with no comment saying why it's special (see [explain-the-design](explain-the-design.md))

## Example

Bad:

```ts
function renderSegment(segment: Segment, isInterceptedRoute: boolean) {
  // ...30 lines, three of which check isInterceptedRoute
}
```

Good: branch once, where the route is known to be intercepted, and keep the general path free of it. Say why at the branch:

```ts
// Intercepted routes render the source page's tree underneath the
// intercepted segment, so they can't reuse the general path.
if (isInterceptedRoute) {
  return renderInterceptedSegment(segment)
}
return renderSegment(segment)
```

## Why

The general case is what most readers need to understand, and what runs most often.
