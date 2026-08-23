# Rig discovery: extend or create `instant-nav.rig.md`

Read an existing `instant-nav.rig.md` first. The Cache Components optimizer and
test-backed Partial Prefetching adoption use the same project-local
production-build and testing API contract; do not create a second rig. Add the
**PREFETCH TARGETS** and **PREFETCH BUDGET** fields below.

If no rig exists because adoption used its manual path or neither earlier
skill ran, create `instant-nav.rig.md` from this template. Reusing the file is
an interoperability contract, not a dependency on running another skill.

When no rig exists, inspect before asking:

- `package.json` build/start/e2e scripts and package manager
- `next.config.*` feature and testing API flags
- `playwright.config.*` base URL, web server, and projects
- existing `instant()` tests and auth/session helpers
- CI/deploy config and preview/staging URLs
- source links, custom Link wrappers, and prefetch props
- destination data reads, Suspense boundaries, and cache directives

Ask only for product or infrastructure facts the repository cannot answer.

## Required fields

1. **BUILD**: command or platform producing the measured production build. Use
   the [Building guide](https://nextjs.org/docs/app/guides/building) to
   interpret the build output and route table.
2. **EXPOSE**: condition enabling
   `experimental.exposeTestingApiInProductionBuild` for measured builds and
   never live production.
3. **RUN**: Playwright command and `BASE_URL`.
4. **TEST USER**: account/session setup and representative seeded data.
5. **DRIFT**: flags, roles, plans, locale, experiments, and data differences
   between the author's browser and test user.
6. **LOOP**: local build -> start -> e2e, or push -> deploy -> e2e; include
   anything the agent cannot do unattended. For a local loop, record the port,
   stop the previous server, fail on `EADDRINUSE`, and verify the new process
   owns the port before testing.
7. **LIVENESS**: commit-SHA probe for remote builds; `n/a` for a freshly built
   local artifact.
8. **WALLS**: credentials, services, build issues, and known workarounds.
9. **PREFETCH TARGETS**: one row per exact navigation:
   `source -> trigger -> destination | SHELL_MARKER | TARGET_MARKER | policy`.
10. **PREFETCH BUDGET**: the user's accepted posture, the observed maximum
    number of viewport-eligible links, and the expected number of distinct
    intent-triggered links per session.

## File template

```md
# instant-nav rig: <project>

- BUILD: <production build and serve/deploy command>
- EXPOSE: <testing API condition>
- RUN: <e2e command> against <BASE_URL source>
- TEST USER: <account/session>; representative data: <...>
- DRIFT: <flags, roles, locale, experiments, seeded data>
- LOOP: <build/deploy -> test>; agent limits: <...>
- LIVENESS: <commit SHA probe; n/a for local>
- WALLS: <known obstacles and workarounds>
- PREFETCH BUDGET: <viewport/intent posture>; viewport max: <N>; distinct intents/session: <N>
- PREFETCH TARGETS:
  - </products -> product-card-42 -> /products/42> | <shell> | <price-panel> | <intent>
```

## Production-like examples

**Local.** `EXPOSE_TESTING_API=1 next build`, then `next start`; Playwright
runs against localhost. Stop the prior server, treat `EADDRINUSE` as a failed
start, and verify the new process owns the chosen port before testing. The
artifact was freshly built, so LIVENESS is `n/a`.

**Preview/staging.** Enable the testing API from a preview/staging-only env
condition, deploy, poll an endpoint/header that exposes the deployed commit,
then run Playwright against that URL. Never expose the API on production.

The testing API is available automatically in `next dev`, but automatic link
prefetching is production-only. A dev run can help inspect the route; only the
production-like rig decides RED or GREEN.
