# prerender-unstable-values

A Cache Components app fails its production build on `new Date()` during
prerendering. Four clock reads sit behind that one error, and each needs a
different fix.

## What this eval does

- **App:** Pulse, a status page app with a home page, an incident status page, and a signed-in account page, after Cache Components was turned on.
- **Request:** the production build fails on `new Date()` while prerendering. Fix it properly and keep every page working as it did.
- **Passes when:** the build and type check pass, the static pages keep their content, the time values behave as described, customers only see their own account, navigation stays instant, and the server logs no prerender errors.
- **Selected from:** Agent Feedback reports where agents hit the unstable-value prerender error under Cache Components and worked around it the wrong way, such as adding `connection()` everywhere or moving content to the browser (findings F-007, 4115, 4398, 3830, 5037).

## Instruction to checks

| The instruction says                                                              | Checked by                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep Cache Components on                                                          | `check-source.mjs`: `cacheComponents` is still enabled                                                                                      |
| The production build and type check pass                                          | `test.sh`: `npm run typecheck` and `npm run build`                                                                                          |
| The server stops logging these errors                                             | `test.sh`: the production server log has no prerender errors                                                                                |
| `/` and `/status` stay fully static, and the footer always shows the current year | `the prerendered home page is complete, including the footer year`, plus `check-source.mjs`: the year is computed, not typed in             |
| "Checked at" is when the incident data was fetched                                | `the prerendered status page carries the cached checked-at time and absolute start times`                                                   |
| Start times read as live relative times, without hydration warnings               | `incident start times become live relative times after hydration`                                                                           |
| Navigation stays instant                                                          | `client navigation to status and account is instant`                                                                                        |
| Customers only ever see their own account                                         | `the prerendered account page is a shell without customer data` and `the account page streams the signed-in customer and isolates visitors` |
| Don't edit `lib/vendor/` or change dependencies                                   | `check-source.mjs`: the vendored SDK and the dependency sets are unchanged                                                                  |

## Difficulty explanation

The error page lists several fixes, and each of them makes the build pass at
some site. Applying one everywhere breaks a requirement the error never
mentions:

- The footer year belongs in the static shell, so it has to be cached, not
  deferred to request time.
- "Checked at" describes the incident fetch, so it has to be captured inside
  the cached function, not read per request or in the browser.
- The relative start times depend on the visitor's clock, so they have to be
  computed in the browser without a hydration mismatch.
- A vendored SDK reads the clock while the account page is prerendered. The
  build stays green and the error only appears in the production server log,
  so the agent has to notice it there and keep the read out of the prerender
  without editing the SDK.

The Agent Feedback reports behind this task (F-007, 4115, 4398, 3830, 5037)
show agents applying the first suggested fix everywhere and stopping once the
build passes.

## Verification explanation

`tests/test.sh` applies the agent's patch to a clean copy of the fixture in a
separate, offline verifier, then runs these gates in order. The first failure
scores 0.

1. `check-source.mjs`: Cache Components is on, dependencies and
   `lib/vendor/` are unchanged, and no year is typed into the source.
2. Type check and production build.
3. `behavior.spec.ts` against the production server: the prerendered HTML for
   `/` and `/status` contains the footer year and "Checked at", every visitor
   sees the same "Checked at", start times become the visitor's live relative
   time under a pinned browser clock without hydration errors, `/status` and
   `/account` navigate instantly, and `/account` shows each customer only
   their own data.
4. The production server log has no prerender or unstable-value errors after
   document, RSC, and prefetch requests.

Every check maps to a sentence in `instruction.md`. `tests/bad-solutions/`
lists the shortcuts these gates catch.
