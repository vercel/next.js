import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

type IndicatorState = {
  status: string | null
  cacheBadge: 'cold' | 'bypass' | null
}

// Records the dev-overlay indicator's state on every mutation while `action`
// runs, then returns the distinct sequence of states it passed through (with
// consecutive duplicates collapsed) and tears the observer down. Asserting the
// whole sequence (rather than `toContainEqual`/a settled check) catches any
// unwanted state in between, including a transient flash. The observer lives on
// the overlay's portal, which survives an App Router transition; a full page
// reload would tear it down.
async function recordIndicatorStates(
  browser: Playwright,
  action: () => Promise<void>
): Promise<IndicatorState[]> {
  // Make sure the indicator has mounted before we start observing, otherwise
  // the portal lookup below finds nothing and records an empty sequence.
  await browser.waitForElementByCss('[data-next-badge]')

  // Wait for the indicator to settle to idle before snapshotting the baseline,
  // so a render/compile transient still in flight from arriving on the page
  // (e.g. the shared dev server finishing a prior test's compilation) isn't
  // captured as the first recorded state. The persistent badge, if any, lives
  // in a separate attribute and is unaffected by this.
  await retry(async () => {
    const status = await browser
      .elementByCss('[data-next-badge]')
      .getAttribute('data-status')
    expect(status).toBe('none')
  })

  await browser.eval(() => {
    const root = Array.from(document.querySelectorAll('nextjs-portal'))
      .map((portal) => portal.shadowRoot)
      .find((shadowRoot) => shadowRoot?.querySelector('[data-next-badge]'))
    const states = ((window as any).__indicatorStates = [])
    if (!root) return
    const record = () =>
      states.push({
        status:
          root
            .querySelector('[data-next-badge]')
            ?.getAttribute('data-status') ?? null,
        cacheBadge: root.querySelector('[data-cold-cache-badge]')
          ? 'cold'
          : root.querySelector('[data-cache-bypass-badge]')
            ? 'bypass'
            : null,
      })
    record()
    const observer = new MutationObserver(record)
    ;(window as any).__indicatorObserver = observer
    observer.observe(root, { attributes: true, childList: true, subtree: true })
  })

  await action()

  const raw: IndicatorState[] = JSON.parse(
    await browser.eval(() => JSON.stringify((window as any).__indicatorStates))
  )

  await browser.eval(() => {
    ;(window as any).__indicatorObserver?.disconnect()
    delete (window as any).__indicatorObserver
    delete (window as any).__indicatorStates
  })

  // This suite asserts the cache-indicator lifecycle: idle (`none`), the cold /
  // cache-disabled rendering pill, and the persistent badge. Drop the two
  // in-progress pills that carry no cache verdict: `compiling` and the plain
  // `rendering` pill shown before the cache miss is detected.
  //
  // This is NOT masking a flicker. Those states are shown correctly and stably:
  // throughout a navigation the transition stays pending, so the indicator
  // keeps a single rendering pill mounted and merely relabels it (compiling ->
  // rendering -> rendering-cold-cache); it never blinks out and back. We drop
  // them only because they are orthogonal to this suite and not deterministic:
  // the first navigation to a route compiles it in a variable number of
  // `BUILDING`/`built` bursts (each a `compiling`), and a teal `rendering`
  // shows for however long the compile-to-verdict gap happens to be, whereas a
  // warmed-up steady-state navigation shows neither. What remains is the
  // deterministic cache-verdict lifecycle. A genuine flicker is still caught: a
  // pill -> badge handoff that blanked to the bare logo would surface as a
  // `none` between them, which is not filtered.
  const meaningful = raw.filter(
    (state) => state.status !== 'compiling' && state.status !== 'rendering'
  )
  return meaningful.filter(
    (state, i) =>
      i === 0 ||
      state.status !== meaningful[i - 1].status ||
      state.cacheBadge !== meaningful[i - 1].cacheBadge
  )
}

describe('cache-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('is none on initial load', async () => {
    const browser = await next.browser('/')

    const badge = await browser.elementByCss('[data-next-badge]')
    const cacheStatus = await badge.getAttribute('data-status')

    // If compilation is still in progress (e.g. on a slow CI machine), the
    // cache status might briefly be "compiling" before becoming "none", so we
    // allow both here, before eventually asserting that it becomes "none".
    expect(cacheStatus).toBeOneOf(['none', 'compiling'])
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const cacheStatus = await badge.getAttribute('data-status')
      expect(cacheStatus).toBe('none')
    })
  })

  if (enableCacheComponents) {
    it('shows the Cold cache badge on an initial cold load and not on a warm reload', async () => {
      const browser = await next.browser('/slow-render/3')

      // Cold load: the cache misses and fills while streaming. The cold verdict
      // is buffered and replayed when the dev overlay's socket connects after
      // load, so the badge appears after a short delay; retry for it. (The fill
      // is written back to the cache as a fast in-memory background task. It
      // isn't awaited before the response, but it lands long before the reload
      // below re-reads the cache - after this retry plus a full navigation - so
      // the reload is a warm hit.)
      await browser.elementById('slow-render')
      await retry(async () => {
        expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
          true
        )
      })
      expect(
        await browser
          .elementByCss('[data-cold-cache-badge] [data-issues-open]')
          .text()
      ).toBe('Cold cache')

      // Warm reload: the cache is warm, so the render reports no miss. The
      // badge is server-pushed (replayed when the overlay's socket reconnects
      // after the reload), and an absence can't be retried on, so we wait out
      // the window in which such a push would arrive and then assert it never
      // appeared.
      await browser.refresh()
      await browser.elementById('slow-render')
      await waitFor(500)
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )
    })

    // Slug `1` is owned exclusively by this test, so its cold→warm lifecycle is
    // controlled here: the first navigation fills it (cold), the re-navigation
    // is warm. Other tests use their own slugs, so there's no interference.
    it('shows the Cold cache indicator on a cold navigation and nothing on a subsequent warm one', async () => {
      const browser = await next.browser('/')

      // `/` is static, so there's no badge on the initial load.
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )

      // First navigation fills a cold cache. While the transition is pending
      // the rendering pill turns orange ("rendering-cold-cache"); once it
      // settles, the status flows into the persistent Cold cache badge.
      // Asserting the whole sequence ensures nothing unexpected (e.g. a teal
      // "rendering" flash) appears in between.
      const coldStates = await recordIndicatorStates(browser, async () => {
        await browser.elementByCss('a[href="/slow-render/1"]').click()
        await browser.elementById('slow-render')
        await retry(async () => {
          expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
            true
          )
        })
      })
      expect(coldStates).toEqual([
        { status: 'none', cacheBadge: null },
        { status: 'rendering-cold-cache', cacheBadge: null },
        { status: 'none', cacheBadge: 'cold' },
      ])
      expect(
        await browser
          .elementByCss('[data-cold-cache-badge] [data-issues-open]')
          .text()
      ).toBe('Cold cache')

      // Navigate away to the static homepage; the badge clears.
      await browser.elementByCss('a[href="/"]').click()
      await retry(async () => {
        expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
          false
        )
      })

      // The cache is now warm, so re-navigating has no miss and no cache
      // verdict: the only state recorded is idle (the in-progress `rendering`
      // pill is filtered by the recorder). We wait out the window in which a
      // server-pushed badge would arrive, so a regression that emitted one
      // would be recorded; there's no positive condition to retry on when
      // asserting its absence.
      const warmStates = await recordIndicatorStates(browser, async () => {
        await browser.elementByCss('a[href="/slow-render/1"]').click()
        await browser.elementById('slow-render')
        await waitFor(500)
      })
      expect(warmStates).toEqual([{ status: 'none', cacheBadge: null }])
    })

    it('shows the combined "Rendering (cache disabled)" status while navigating with caches disabled', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // The initial load bypasses caches, so the Cache disabled badge is shown.
      await retry(async () => {
        expect(await browser.hasElementByCss('[data-cache-bypass-badge]')).toBe(
          true
        )
      })

      // Navigating bypasses caches too: the rendering pill turns orange and
      // reads "Rendering (cache disabled)" while the transition is pending,
      // then settles back into the persistent Cache disabled badge.
      const states = await recordIndicatorStates(browser, async () => {
        await browser.elementByCss('a[href="/slow-render/2"]').click()
        await browser.elementById('slow-render')
        await retry(async () => {
          expect(
            await browser.hasElementByCss('[data-cache-bypass-badge]')
          ).toBe(true)
        })
      })
      expect(states).toEqual([
        { status: 'none', cacheBadge: 'bypass' },
        { status: 'rendering-cache-disabled', cacheBadge: null },
        { status: 'none', cacheBadge: 'bypass' },
      ])
    })

    it('shows the Cold cache badge on an initial cold load and not on a warm reload for a short-lived cache', async () => {
      const browser = await next.browser('/short-lived')

      // Cold load: the short-lived cache misses and fills while streaming, so
      // the cold verdict is replayed after load.
      await browser.elementById('short-lived')
      await retry(async () => {
        expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
          true
        )
      })

      // Warm reload: the short-lived entry is a hit. It is deferred to a later
      // stage (it stays out of the static shell), but its cache read is ended up
      // front, so it does not register as a phantom cache miss and no badge
      // appears. An absence can't be retried on, so wait out the
      // replay-on-connect window and then assert it never showed.
      await browser.refresh()
      await browser.elementById('short-lived')
      await waitFor(500)
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )
    })

    it('shows the Cold cache badge on an initial cold load and not on a warm reload for a private cache', async () => {
      const browser = await next.browser('/private')

      // Cold load: the private cache misses and fills while streaming, so the
      // cold verdict is replayed after load.
      await browser.elementById('private')
      await retry(async () => {
        expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
          true
        )
      })

      // Warm reload: the private entry is now persisted in dev and served as a
      // stale-while-revalidate hit, so it does not register as a cache miss and
      // no badge appears. An absence can't be retried on, so wait out the
      // replay-on-connect window and then assert it never showed.
      await browser.refresh()
      await browser.elementById('private')
      await waitFor(500)
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )
    })

    it('shows cache-bypassing badge when cache is disabled', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the badge to appear and show cache-bypassing status
      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheBadgeAttr = await badge.getAttribute('data-cache-badge')
        expect(cacheBadgeAttr).toBe('bypass')
      })

      // Verify the cache bypass badge is visible
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('shows cache-bypassing badge when draft mode is enabled', async () => {
      const browser = await next.browser('/api/draft/enable')

      // Wait for the badge to appear and show cache-bypassing status
      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheBadgeAttr = await badge.getAttribute('data-cache-badge')
        expect(cacheBadgeAttr).toBe('bypass')
      })

      // Verify the cache bypass badge is visible
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('persists cache-bypassing badge after navigation when cache is disabled', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for initial cache-bypassing badge
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Navigate to another page
      const link = await browser.waitForElementByCss('a[href="/navigation"]')
      await link.click()

      // Wait for navigation to complete
      await retry(async () => {
        const text = await browser.elementById('navigation-page').text()
        expect(text).toContain('Hello navigation page!')
      })

      // Verify cache-bypassing badge persists after navigation
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge still shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('opens devtools menu when clicking cache-bypassing badge', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the cache-bypassing badge to appear
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Click the cache bypass badge
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      await badgeButton.click()

      // Verify devtools menu opens
      await retry(async () => {
        const hasMenu = await browser.hasElementByCss('#nextjs-dev-tools-menu')
        expect(hasMenu).toBe(true)
      })
    })

    it('opens cache-disabled info panel from the devtools menu', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Open the devtools menu via the cache-bypass badge (the regular
      // indicator is hidden when caches are bypassed).
      await browser
        .elementByCss('[data-cache-bypass-badge] [data-issues-open]')
        .click()

      await retry(async () => {
        const hasMenu = await browser.hasElementByCss('#nextjs-dev-tools-menu')
        expect(hasMenu).toBe(true)
      })

      await browser.elementByCss('[data-cache-disabled]').click()

      await retry(async () => {
        const article = await browser.elementByCss('.dev-tools-info-article')
        expect(await article.text()).toMatchInlineSnapshot(`
         "While loading this page, all caches were bypassed.

         This is the case when the cache was disabled in the browser's devtools, the page was hard-reloaded, or draft mode is enabled.

         As a result, the loading experience might not be the same as in production. React's DevTools will also not accurately show information about what would normally suspend in the page, and Next.js cannot validate whether a navigation to this page would be instant or blocking."
        `)
      })
    })

    it('can dismiss cache-bypassing badge', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the cache-bypassing badge to appear
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Click the collapse button
      const collapseButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-collapse]'
      )
      await collapseButton.click()

      // Verify badge is dismissed
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(false)
      })
    })
  }
})
