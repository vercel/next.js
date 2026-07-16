# per-page decisions: removing `instant = false`

Read this when a route still blocks after you remove its `instant = false` and the dev overlay's fix card isn't enough on its own. Each section here covers a judgment call the agent shouldn't make alone.

## deciding what to do with a blocking read

Read the full linked page behind the fix card — not only the inline snippet — before editing. The card unblocks the build, but the page covers the details that make the route's navigation actually instant (e.g. where to place a `<Suspense>` boundary). Don't improvise.

If you're unsure which fix fits, the right call usually depends on what this part of the page is _for_, which the code doesn't capture. Ask the user about their goal for it rather than guessing. Frame it as a product/UX question: should this content be there instantly on load, or is it fine for it to stream in a moment later? Should everyone see the same thing (cacheable) or is it per-user / per-request? Tie the technical fix to that answer (cache it, wrap it in `<Suspense>`, or keep it request-time), so they're deciding the experience, not the API.

## security gates and other code you can't infer

If the blocking code looks like it's there for a _reason you can't infer_ — a security gate at the page top (`await verifyAccess()`, an auth redirect, a feature-flag check) where moving it inside `<Suspense>` would change what the code guarantees — stop and ask the user before refactoring. The build error wants `<Suspense>`, but wrapping a gate in `<Suspense>` defeats the gate. Only the person who wrote it knows whether to keep the route blocking (`instant = false` as a documented Block), restructure the page so the gate runs differently, or move the check to [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

If _every_ route under a layout is gated this way, a documented Block on the layout is the correct end state. Moving the gate to [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) is the architectural fix, not a Cache Components one, and that's a follow-up rather than something to hold the migration on.

For the broader picture, read the [Authentication guide](https://nextjs.org/docs/app/guides/authentication) (where auth checks belong: Proxy for routing, Data Access Layer for data) and the [Data Access Layer section of Data Security](https://nextjs.org/docs/app/guides/data-security#data-access-layer) (centralized auth checks that compose with `'use cache'`).

If you don't know how to make a piece of code Cache Components–correct without changing what it does, ask.

## when to leave a Block in place

If a route is genuinely meant to block — it's inherently per-request with no useful static shell — or the refactor would be large and the user would rather not take it on now, that's a legitimate outcome. Keep `instant = false`, but confirm it with the user first and turn its `// TODO: Cache Components adoption` comment into a reason, e.g. `// instant = false: kept on purpose — fully request-time dashboard` or `// instant = false: deferred, refactor too large for now`.

A documented, deliberate Block is fine to leave after the migration; an undocumented leftover opt-out is not.
