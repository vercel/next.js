# Page weight

rule: Bytes added to every page are quantified and justified in the description.

severity: medium. Some areas make this strong: see `app-render-pipeline`, `app-router-client`, `rsc-payload-format`, and `turbopack-runtime-and-hmr`.

## Signs in review

- A new inline `<script>`, bootstrap snippet, or `__next_f` chunk written on every render
- A new field that is always sent in the router state or RSC payload, even when unused
- Code that ships in the shared client runtime (`client/app-*`, the Turbopack runtime) whether or not the app uses the feature
- The `next-stats-action` comment shows a "Rendered Page Sizes" or "Client Bundles (main)" increase that the description doesn't mention

## Example

Bad: "Inline the route manifest into the bootstrap script so the client can match routes without a request." This adds bytes to every page's HTML, growing with the number of routes, and the description doesn't say so.

Good:

> Inlines only the routes reachable from links on the current page, not the whole manifest. Rendered Page Sizes in the stats app: +180B. For an app with 2,000 routes, the inline data is capped at 4KB, with the rest fetched on demand.

## Why

A per-page cost is paid by every app on every request, and small increases compound. The stats app measures a tiny fixture, so a cost that scales with tree depth or link count may not show up there. When it doesn't, the description has to say how the size changes.
