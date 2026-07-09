# RED-test robustness — verify structural REDs and policy-only evidence

The C-gate for the workflow's structural branch. A RED that is red for the wrong reason sends you
optimizing a route that was never broken: the route becomes instant, the test stays red (or the code
is contorted to satisfy a broken assertion), and the effort lands on the wrong problem. The
prevention is cheap — spend a few minutes verifying the RED is trustworthy first. A policy-only
Partial Prefetching adoption may be GREEN before and after; it uses the separate evidence branch
below and must not manufacture a structural RED.

## The deciding question

> **Does the marker render WITHOUT the lock, as the test user?**

- **No** — the test is red because the marker or page is not there for that user or environment. A
  marker bug, not an instant-navigation bug. Fix the marker. (This is the most common case.)
- **Yes** — the marker exists and is reachable; a red under the lock is a genuine "not instant".
  Optimize the route.

Use that question only for the structural branch. A policy-only adoption follows the evidence path
below instead.

## Policy-only adoption evidence

When the adopted App Shell already provides useful immediate UI, keep the locked test GREEN and
skip the structural C-gate/D loop. Capture these instead:

1. the before and after app-level `partialPrefetching` value and effective destination `prefetch`;
2. the exact inbound Link and its `prefetch` prop;
3. the dev-insight/audit result that justified keeping or removing `prefetch={true}`; and
4. a known-blocking control that proves `instant()` engaged on the same production artifact; and
5. network/protocol evidence only if the claim includes actual browser delivery.

The config/route/Link change proves configured adoption; the still-GREEN `instant()` guard proves
the resulting immediate experience remains useful once the control establishes the lock. Neither
substitutes for the other.

## The structural robustness checklist (all must hold)

1. **Red on baseline** — fails on the unfixed route.
2. **Right reason** — without the lock, the marker is visible on the production-build rig (never
   `next dev`), running as the test user — not only in the author's own logged-in session.
3. **Structural differential** — reverting only the shell-building fix → RED; re-applying → GREEN;
   nothing else moves it. Prefetch policy uses separate evidence.
4. **Non-gameable marker** — a sync element of the phase-A1 immediate contract, never data that
   should stream afterward.
5. **Deterministic on a production build** — stable across N runs; never `next dev`.
6. **Discriminating both ways** — the positive marker is present under the lock on an instant
   route and absent on a blocking one; any negative marker is genuinely outside the selected
   prefetch contract.
7. **Renders for the test user** — under that user's flags, plan, role, and data.
8. **Conditional redirects accounted for** — assert at the route's real destination for that user.
9. **Real selector** — a `data-testid` on a known immediate-UI node, not a guessed `role`/`name`.
10. **Visible marker** — not `display:none`, off-screen, or inside a hover overlay; for lists,
    target `.filter({ visible: true }).first()`.
11. **Fresh build under test** — the deployment being measured contains the latest commit, not a
    build URL still serving the previous deploy.
12. **Prefetch contract recorded** — app config, destination `prefetch`, and the actual inbound
    Link prop agree with the positive and negative markers.
13. **Delivery evidence matches the claim** — use the dev insight or network/protocol observation
    for route/Link policy; do not infer real prefetch delivery from `instant()`.

## Taxonomy — red for the wrong reason

Any of these makes a RED untrustworthy. None of them is "the navigation isn't instant."

| Wrong reason                 | How it occurs                                                                              | How to rule it out                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Selector matches nothing** | a guessed `getByRole('button', { name: 'Folder' })`                                        | grep the component for the real accessible name; add a `data-testid`                              |
| **Conditional redirect**     | the route `redirect()`s for the test user (flag/role), so the marker page is never reached | check the page's top-level branches; assert at the real destination, or pin the flag              |
| **Flag / plan / role gate**  | the author has the flag or plan; the test user does not                                    | run the unlocked baseline as the test user; pin flags via the project's override mechanism        |
| **Empty state**              | the marker only exists when data does; the CI account is empty                             | pick a marker present in the empty state (a layout element such as the page header), or seed data |
| **Timeout / flake**          | a slow API or transient infrastructure error                                               | re-run; separate infrastructure flake from a real signal                                          |
| **Streamed marker**          | the marker is behind `<Suspense>`, outside the selected immediate contract                 | choose a sync contract element; verify its boundary placement                                     |
| **Wrong prefetch contract**  | a full/runtime Link includes data assumed to be App Shell-only                             | inspect config, destination export, and exact Link prop; choose markers from that contract        |
| **Auth redirect**            | unauthenticated → `/login`                                                                 | confirm login succeeded before the navigation                                                     |
| **Stale deployment**         | the test ran against the previous build (the URL under test still serves the prior deploy) | poll the deployment for a marker from the latest commit before trusting any verdict               |
| **Hidden / off-screen**      | the testid is on a hover-overlay or off-screen list item                                   | put the marker on an always-visible node; `.filter({ visible: true }).first()` for lists          |

## Worked cases

These are illustrative failures from real optimization runs; each was red for a wrong reason, and
none was an instant-navigation problem. One app's drift surface might be dominated by feature flags and
plans; another's by auth state, an empty database, or locale. The taxonomy lists every wrong
reason; the rig file's DRIFT list says which rows apply to your app.

- **Guessed selector + empty state** — the marker was a button picked by a guessed accessible name
  that no element actually had, on a list page whose CI account had no rows. → checks 7, 9. Fix: a
  `data-testid` on a real node in the selected immediate contract.
- **Hidden marker** — the testid sat first on a `hidden sm:block` hover-overlay link, then on an
  off-screen carousel card; Playwright resolved the element but reported it hidden. → check 10.
  Fix: an always-visible node; for lists, `.filter({ visible: true }).first()`.

## Differential check (capture in the PR)

This applies only when phase C found a structural RED. The strongest evidence
that the RED measured the route's shell structure:

```
1. on the fixed branch → GREEN
2. revert ONLY the shell-building fix (for example, the <Suspense> push-down) → RED
3. re-apply → GREEN
4. confirm no other change moves it
```

Link the two runs (or include the toggle diff and results) in the PR description. This proves the
`instant()` guard measures the structural experience. It does not prove production prefetch
delivery: reverting `partialPrefetching`, `prefetch = 'partial'`, or a Link prop may leave the
controlled test GREEN. Verify that policy toggle with the dev insight or network/protocol evidence
recorded in A1.

## `instant()` is not a stopwatch

The test does not measure how fast a navigation is. `instant()` gates writes outside the active
prefetch contract so the expected immediate UI can be asserted; the signal is presence, not speed.
Under the lock, an instant route's static shell, App Shell, or extended link-prefetched UI is
present, and content outside the selected contract does not commit, regardless of wait time.
Therefore:

- The shipped assertion is `await expect(SHELL_MARKER).toBeVisible()` under the lock. No custom
  timeout and no `painted` boolean.
- A custom short timeout (e.g. `3000`) implies a race against a clock that does not exist. It adds
  nothing to the verdict and invites false REDs on an instant route whose commit lands a microtask
  late.
- Do not use `locator.isVisible({ timeout })` as a soft wait — Playwright deprecated and ignores
  that timeout; the call returns immediately.
- "Renders for the test user" (checks 7–9) is established at authoring time with the unlocked
  baseline scaffold, not by a timed assertion in the shipped test.

## `instant()` guards need no retries and no prefetch warming

An `instant()` guard is deterministic. Do not configure retries on one, and do not hover-warm to
help a prefetch land in time. Under the lock, the router initiates a controlled route prefetch and
awaits it before committing — even for a `prefetch={false}` link, even for a route already in the
prefetch cache — so the committed UI does not depend on any prior render, hover, or menu-open
prefetch. A flaky guard has a real cause: a marker outside the selected immediate contract, a
flag/role/empty-state gap for the test user, or a genuinely blocking route. The fix is in the page
or the marker; a retry masks the regression the guard exists to catch. The only legitimate
`.hover()`/menu-open is when the trigger element itself is not in the DOM until hovered or opened.

This controlled prefetch is why `instant()` is not proof of real prefetch delivery. A
`prefetch={false}` Link issues no production prefetch before the click but can still pass the guard.
For Partial Prefetching adoption, establish the route/Link policy in phase A1 and use separate
network/protocol observation when actual delivery is part of the acceptance criteria.

## Silent no-op: the testing API must be exposed in the measured build

`instant()` works by setting a cookie (`next-instant-navigation-testing`) that lock code inside the
build reads. It does not throw when that lock code is absent — it only throws on nested calls or an
unknown base URL. If the build was produced without the testing API
(`experimental.exposeTestingApiInProductionBuild`), the cookie is ignored, the navigation runs
normally, and the `instant()` test passes vacuously. A green `instant()` test is only meaningful if
the lock engaged.

Use the configuration check, the applicable engagement proof, and the stronger assertion when
available:

1. **Confirm the API is exposed on the target.** Wire the flag to the platform's preview/staging
   condition or an explicit environment variable — the rig file records the project's spelling
   (SKILL.md phases 0 and A). Do not trust a pass from a build where it is not set.
2. **Demonstrate lock engagement on the same artifact.** The structural branch uses its verified
   target RED. The policy-only branch uses the known-blocking control from phase A; the target's
   expected GREEN cannot prove this by itself.
3. **Make the test more discriminating** — for any route with content outside its selected
   contract, also assert that content is gated under the lock, not only that the immediate UI is
   present (`test-template.md`, positive-plus-negative variant). This catches contract mistakes and
   some missing-lock failures, but is not independent proof of lock engagement: an ordinary Partial
   Prefetching navigation can commit the App Shell while URL data is still in flight. The exposed
   flag plus the applicable RED/control above are the proof.

   Choose the negative marker from the contract. For a default Link under Partial Prefetching,
   non-root `params`, `searchParams`, or full-URL-dependent content is appropriate. Cookies and
   headers may already be present in a session-specific App Shell, and a `prefetch={true}` Link may
   legitimately include cached or runtime-prefetched content.

   Under the lock, the gated half holds for both navigation types regardless of warm state: the
   soft-nav client lock gates writes outside the contract, and on an initial load the server honors
   the cookie on the document request and suspends deferred data. Without the testing API, timing
   alone may temporarily produce the same observation, which is why checks #1 and #2 are mandatory.

## Determinism and the rig

- Always measure on a production build, never `next dev` — SKILL.md phase A owns this invariant and
  its rationale.
- Run the RED several times; an intermittently red gate is not a gate. If it flakes, determine
  whether the cause is infrastructure (transient errors) or a real race before trusting either
  color.
