# Playwright Verification

Use this before writing or changing `@next/playwright` Instant tests.

## Verification Order

The canonical check is "make the focused Instant Playwright oracle correct, run it, then run build." Build cannot observe the locked shell.

1. Identify the focused Instant test for the slice.
2. Audit and fix the test: it must cover released route status, rewritten route owner, route-owned marker, diagnostics, stable chrome, and geometry.
3. Run the corrected focused test before any build.
4. Inspect test artifacts, route diagnostics, and dev logs.
5. Run build/prerender validation only after the corrected focused test has passed.

Once build is the right next gate, run a local production-like build with the app's supported Node version before waiting on a Vercel deployment.

When running against a production build or preview, first prove the server exposes Next's testing API in that environment. Production builds require `experimental.exposeTestingApiInProductionBuild`. Without it, the `next-instant-navigation-testing` cookie is silently ignored and the test sees the released UI. Keep the flag off in real production; gate it to preview or a local test env.

A focused test must be able to fail for the wrong route owner, a hidden duplicate shell, stale persistent chrome, missing diagnostics, a bad released-route status, or geometry drift. A passing weak test is not Instant evidence.

## Test Shape

- Use the project's Playwright runner, config, fixtures, auth helpers, storage state, and URL helpers.
- Separate initial-load and client-navigation coverage.
- For initial load, dataful persistent controls (account/team switchers) may only prove a stable inert frame during the locked shell. After unlock, assert the real control resolves before comparing geometry.
- For client navigation from a loaded source route, assert the resolved control remains present during the lock; a skeleton there means persistent chrome resuspended.
- For initial load on a fast preview or production-like server, the locked shell can resolve before the first `domcontentloaded` poll. Use `waitUntil: 'commit'` inside `instant(...)`. Keep post-unlock assertions.
- For client navigation, start from a real released source route, enter `instant(...)`, perform the click/router action, and assert the locked destination shell.
- For navigation launched from a list, click a visible link the released UI actually rendered and derive the destination identity from its href.
- When first paint must already be correct (no hydration delay), add a no-hydration oracle that aborts script requests and asserts the server HTML contains the route-owned frame and primary body.
- Create separate tests for logged-out and logged-in states when stable chrome differs.

## Accuracy Model

The strongest coverage is layered:

```text
Route utility test:    visible URL + state -> expected internal owner + generated params
Released route test:   route loads and is interactive without Instant
Instant locked-shell:  owner marker, stable regions visible once, diagnostics clean
Unlock test:           released UI becomes interactive, URL and content correct
Geometry test:         locked shell matches released UI for stable chrome and first content
Screenshot:            artifact after architecture checks pass (not the primary oracle)
```

Use all layers for important routes. For lower-value routes, keep the earlier layers and add geometry or snapshots only when there is a real visual contract.

## Accuracy Risks

- Owner markers prove DOM was rendered, not that the public URL reached the intended App Router owner. Pair with route utility tests when routing can vary.
- A green released route does not prove Instant can capture the shell. Dynamic owner params must be generated for the locked shell path.
- Same-page geometry after unlock is good for continuity, but can hide reload, hydration, or released-route-only bugs. Use a separate released page for key routes.
- A released-route unlock failure can be a real route robustness issue, not a test nuisance. If optional below-the-fold data throws and blocks the prompt, preserve the section frame with a degraded local fallback before weakening the oracle.
- Geometry can bless fake UI. Require route ownership, no duplicate candidate shells, clean diagnostics, and released interactivity before accepting geometry.

## Diagnostics Capture

Register these before navigation:

- `page.on('console')`
- `page.on('pageerror')`
- request failure capture

Fail the test on route-specific Instant diagnostics such as:

- `blocking-route` errors
- `Could not validate \`unstable_instant\`` errors
- `INSTANT_VALIDATION_ERROR`
- `NEXT_STATIC_GEN_BAILOUT`
- `throwIfDisallowedDynamic`
- `encountered uncached data`
- stack overflows such as `Maximum call stack size exceeded`

Do not rely on `networkidle` in dev. Prefer the earliest truthful navigation event for the assertion you need.

## Assertion Order

Order assertions so architecture failures do not hide behind screenshots:

1. Released route loads outside the Instant lock.
2. Diagnostics listeners registered before navigation.
3. Locked shell exposes the expected route-owner marker.
4. Stable chrome and primary frame visible exactly once.
5. Route-specific blocking diagnostics absent.
6. Released UI after unlock is interactive.
7. Geometry matches released UI.
8. Screenshot snapshots match (if used).

## Locator Discipline

- Prefer strict, visible locators. Treat `.first()` or a custom `firstVisible()` as an architecture smell.
- Scope shell assertions to a route-owned container. Generic selectors like `h1`, tab trigger ids, or shared `data-testid` values can match hidden `<div hidden id="S:...">` Suspense staging payloads. Use role-based locators (`getByRole('button', { name: /.../ })`) for visible controls.
- Separate structural shell markers from interactive targets. An inert fallback prompt can share the frame marker used for geometry, but submit helpers must target a real control: visible, not `aria-hidden`, not `readonly`, enabled/editable.
- For flows that wait on a network response, derive the matcher from the trace and app code, not from an older route name. Keep analytics or telemetry calls out of the matcher.
- When installing broad request probes such as `page.route('**/*')`, call `route.fallback()` for non-matching requests, not `route.continue()`. `continue()` completes routing immediately and can bypass narrower fixture handlers.
- Avoid class selectors unless class geometry is the contract being tested. Pair class-based frame selectors with visible-count and text/role assertions.

## Minimal Pattern

```ts
import { instant } from '@next/playwright'
import test, { expect, type Page } from '@playwright/test'

const selectors = {
  title: '[data-testid="page-title"]',
  frame: '[data-testid="app-main-frame"]',
} as const

async function collectGeometry(page: Page) {
  return page.evaluate((input) => {
    return Object.fromEntries(
      Object.entries(input).map(([key, selector]) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Missing geometry element: ${selector}`)
        const rect = element.getBoundingClientRect()
        return [
          key,
          {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        ]
      })
    )
  }, selectors)
}

test('route has a truthful instant shell', async ({ browser, page }) => {
  const diagnostics: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') diagnostics.push(m.text())
  })
  page.on('pageerror', (e) => diagnostics.push(e.message))

  let shellGeometry: Awaited<ReturnType<typeof collectGeometry>>

  await instant(page, async () => {
    await page.goto('/target-route', { waitUntil: 'commit' })
    await expect(
      page.locator('[data-instant-boundary="target-route"]')
    ).toBeVisible()
    shellGeometry = await collectGeometry(page)
  })

  const released = await browser.newPage({
    viewport: page.viewportSize() ?? undefined,
  })
  await released.goto('/target-route', { waitUntil: 'domcontentloaded' })
  await expect(released.locator(selectors.frame)).toBeVisible()
  const releasedGeometry = await collectGeometry(released)

  for (const [key, shellRect] of Object.entries(shellGeometry!)) {
    const releasedRect = releasedGeometry[key]
    for (const field of ['x', 'y', 'width', 'height'] as const) {
      expect
        .soft(
          Math.abs(shellRect[field] - releasedRect[field]),
          `${key}.${field}`
        )
        .toBeLessThanOrEqual(2)
    }
  }

  expect(
    diagnostics.filter((text) =>
      /blocking-route|INSTANT_VALIDATION_ERROR|NEXT_STATIC_GEN_BAILOUT|throwIfDisallowedDynamic|encountered uncached data/.test(
        text
      )
    )
  ).toEqual([])

  await released.close()
})
```
