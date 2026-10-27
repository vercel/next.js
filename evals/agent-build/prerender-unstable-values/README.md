# prerender-unstable-values

A Cache Components app fails its production build on `new Date()` during
prerendering. Four clock reads sit behind that one error, and each needs a
different fix.

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
lists the shortcuts these gates reject.
