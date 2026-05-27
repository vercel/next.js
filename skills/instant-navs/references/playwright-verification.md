# Playwright Verification

Use this before writing or changing `@next/playwright` Instant tests.

## Validation Order

The canonical loop is "make the focused Instant Playwright test correct, run it, then run build." Build cannot observe the captured shell.

1. Identify the focused Instant test for the slice.
2. Audit and fix the test: it must cover HTTP status when the route fully loads, rewritten route owner, route-owned marker, diagnostics, stable shared layout, and layout dimensions.
3. Run the corrected focused test before any build.
4. Inspect test artifacts, route diagnostics, and dev logs.
5. Run build/prerender validation only after the corrected focused test has passed.

Run a local production-like build with the app's supported Node version before waiting on a Vercel deployment.

For production builds or previews, first prove the server exposes Next's testing API in that environment. Production builds require `experimental.exposeTestingApiInProductionBuild`. Without it, the `next-instant-navigation-testing` cookie is silently ignored and the test sees the loaded UI. Keep the flag off in real production; gate it to preview or a local test env.

## What Makes A Test Correct

A passing test that cannot fail for the right reasons is not Instant evidence. Before trusting a focused Playwright test, confirm it would fail for:

- the wrong route owner,
- a hidden duplicate shell,
- stale persistent shared layout,
- route-specific blocking diagnostics,
- a bad HTTP status when the route fully loads,
- visual layout drift.

## Test Shape

- Use the project's Playwright runner, config, fixtures, auth helpers, storage state, and URL helpers.
- Separate initial-load and client-navigation coverage.
- For initial load, dataful persistent controls (such as workspace or account switchers) may only prove a stable inert frame during the captured shell. After the shell releases, assert the real control resolves before comparing layout dimensions.
- For client navigation from a loaded source route, assert the resolved control remains present while the shell is captured; a skeleton there means the persistent shared layout resuspended.
- For initial load on a fast preview or production-like server, the captured shell can resolve before the first `domcontentloaded` poll. Use `waitUntil: 'commit'` inside `instant(...)`. Keep post-release assertions.
- For client navigation, start from a real loaded source route, enter `instant(...)`, perform the click/router action, and assert the captured destination shell.
- For navigation launched from a list, click a visible link the loaded UI actually rendered and derive the destination identity from its href.
- When first paint must already be correct (no hydration delay), add a no-hydration test that aborts script requests and asserts the server HTML contains the route-owned frame and primary body.
- Create separate tests for distinct variant states (for example, signed-in vs signed-out) when the stable shared layout differs.

## Accuracy Model

The strongest coverage is layered:

```text
Route utility test:    visible URL + state -> expected internal owner + generated params
Loaded route test:     route loads and is interactive without Instant
Instant captured shell: owner marker, stable regions visible once, diagnostics clean
Release test:          loaded UI becomes interactive, URL and content correct
Layout dimension test: captured shell matches loaded UI for stable shared layout and first content
Screenshot:            artifact after architecture checks pass (not the primary test)
```

Use all layers for important routes. For lower-value routes, keep the earlier layers and add geometry or snapshots only when there is a real visual contract.

## Accuracy Risks

- Owner markers prove DOM was rendered, not that the public URL reached the intended App Router owner. Pair with route utility tests when routing can vary.
- A green loaded route does not prove Instant can capture the shell. Dynamic owner params must be generated for the captured shell path.
- Same-page layout dimensions after release are good for continuity, but can hide reload, hydration, or load-only bugs. Use a separate loaded page for key routes.
- A release failure can be a real route robustness issue, not a test nuisance. If optional below-the-fold data throws and blocks the primary content, preserve the section frame with a degraded local fallback before weakening the test.
- Layout-dimension checks can bless fake UI. Require route ownership, no duplicate candidate shells, clean diagnostics, and loaded interactivity before accepting layout dimensions.

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

1. Route loads in its normal loaded state outside Instant capture.
2. Diagnostics listeners registered before navigation.
3. Captured shell exposes the expected route-owner marker.
4. Stable shared layout and primary frame visible exactly once.
5. Route-specific blocking diagnostics absent.
6. Loaded UI after the shell releases is interactive.
7. Layout dimensions match the loaded UI.
8. Screenshot snapshots match (if used).

## Locator Discipline

- Prefer strict, visible locators. Treat `.first()` or a custom `firstVisible()` as an architecture smell.
- Scope shell assertions to a route-owned container. Generic selectors like `h1`, tab trigger ids, or shared `data-testid` values can match hidden `<div hidden id="S:...">` Suspense staging payloads. Use role-based locators (`getByRole('button', { name: /.../ })`) for visible controls.
- Separate structural shell markers from interactive targets. An inert fallback control can share the frame marker used for layout-dimension checks, but interaction helpers must target a real control: visible, not `aria-hidden`, not `readonly`, enabled and editable.
- For flows that wait on a network response, derive the matcher from the trace and app code, not from an older route name. Keep analytics or telemetry calls out of the matcher.
- When installing broad request probes such as `page.route('**/*')`, call `route.fallback()` for non-matching requests, not `route.continue()`. `continue()` completes routing immediately and can bypass narrower fixture handlers.
- Avoid class selectors unless class-based layout dimensions are the contract being tested. Pair class-based frame selectors with visible-count and text/role assertions.

## Common Test-Side Traps

When a Playwright failure could be a test-side bug, check these patterns before editing source:

- **Hidden React 19 staging DOM.** Strict locators like `h1`, `getByText`, or shared `data-testid` values match `<div hidden id="S:...">` Suspense staging payloads. Scope to a route-owned container or use role-based visible locators.
- **Interactive helpers typing into inert shell controls.** A fallback input can be a valid layout-dimension marker while it is `aria-hidden` or `readonly`. Interaction helpers must require a visible, enabled, editable control.
- **`waitUntil: 'domcontentloaded'` missing fast-resolving shells.** When the captured shell releases before the first locator poll, use `waitUntil: 'commit'` inside `instant(...)`. Keep post-release assertions.
- **Asserting before the navigation started.** If a click immediately polls for the target boundary without waiting for the real target RSC request or URL transition, the test spends its timeout inspecting the old page.
- **Prefetch races on stale-data tests.** When freezing payloads, ignore RSC requests with `next-router-prefetch: 1`; otherwise the test asserts before the real navigation captures the shell.
- **Broad `page.route('**/\*')`probes starving narrower handlers.** Use`route.fallback()` for non-matching requests.
- **Viewport visibility.** Target rendered but offscreen.
- **Selector specificity.** Matches popovers, virtualization, or Radix triggers.

## Minimal Pattern

```ts
import { instant } from '@next/playwright'
import test, { expect, type Page } from '@playwright/test'

const selectors = {
  title: '[data-testid="page-title"]',
  frame: '[data-testid="app-main-frame"]',
} as const

async function collectLayoutDimensions(page: Page) {
  return page.evaluate((input) => {
    return Object.fromEntries(
      Object.entries(input).map(([key, selector]) => {
        const element = document.querySelector(selector)
        if (!element)
          throw new Error(`Missing layout-dimension element: ${selector}`)
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

  let shellDimensions: Awaited<ReturnType<typeof collectLayoutDimensions>>

  await instant(page, async () => {
    await page.goto('/target-route', { waitUntil: 'commit' })
    await expect(
      page.locator('[data-instant-boundary="target-route"]')
    ).toBeVisible()
    shellDimensions = await collectLayoutDimensions(page)
  })

  const loaded = await browser.newPage({
    viewport: page.viewportSize() ?? undefined,
  })
  await loaded.goto('/target-route', { waitUntil: 'domcontentloaded' })
  await expect(loaded.locator(selectors.frame)).toBeVisible()
  const loadedDimensions = await collectLayoutDimensions(loaded)

  for (const [key, shellRect] of Object.entries(shellDimensions!)) {
    const loadedRect = loadedDimensions[key]
    for (const field of ['x', 'y', 'width', 'height'] as const) {
      expect
        .soft(Math.abs(shellRect[field] - loadedRect[field]), `${key}.${field}`)
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

  await loaded.close()
})
```
