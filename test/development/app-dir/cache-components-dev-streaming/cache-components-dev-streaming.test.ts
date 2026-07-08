import { nextTestSetup, Playwright } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('cache-components-dev-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should stream suspense boundaries while filling caches in the background', async () => {
    const browser = await next.browser('/use-cache', {
      waitHydration: false,
      // do not wait for "load", we want to inspect the page as it streams in
      waitUntil: 'commit',
    })

    // The loading boundary should be streamed immediately, without waiting for
    // the cache to be filled. Read it at commit so we don't wait for "load"
    // (which only fires once the cache has filled).
    expect(await browser.elementByCss('p', { waitUntil: false }).text()).toBe(
      'Loading...'
    )

    // Eventually, the cache content should be streamed in.
    await retry(async () => {
      expect(
        await browser.elementByCss('p', { waitUntil: false }).text()
      ).toBeDateString()
    })

    // Now that the cache is filled, it should be served immediately with the
    // shell on the next page load, without going through the loading boundary.
    await browser.refresh({ waitUntil: 'commit' })
    expect(
      await browser.elementByCss('p', { waitUntil: false }).text()
    ).toBeDateString()
  })

  it('streams a Suspense fallback above a private cache while filling it in the background', async () => {
    const browser = await next.browser('/use-cache-private', {
      waitHydration: false,
      // do not wait for "load", we want to inspect the page as it streams in
      waitUntil: 'commit',
    })

    // The loading boundary should be streamed immediately, without waiting for
    // the private cache to be filled. Read it at commit (`waitUntil: false`) so
    // we don't wait for "load" (which only fires once the cache has filled).
    expect(
      await browser
        .elementByCss('#private-fallback', { waitUntil: false })
        .text()
    ).toBe('Loading...')

    // Eventually, the private cache content streams in. Waiting for the element
    // (without waiting for "load") is enough; the boundary reveals `#private`
    // atomically with its final content, so no retry is needed.
    expect(
      await browser.elementByCss('#private', { waitUntil: false }).text()
    ).toBeDateString()
  })

  it('streams dynamic content immediately while a sibling cache is still filling', async () => {
    const browser = await next.browser('/dynamic-streaming', {
      waitHydration: false,
      // do not wait for "load", we want to inspect the page as it streams in
      waitUntil: 'commit',
    })

    // The dynamic content (guarded by `await connection()`) must stream right
    // away, in parallel with the sibling's long-running cache fill, rather than
    // being withheld until the cache finishes filling.
    //
    // Read with `waitUntil: false` so we don't wait for the page "load" event,
    // which (with `waitUntil: 'commit'`) only fires once the slow cache has
    // filled, advancing past the very window this test inspects.
    expect(
      await browser.elementByCss('#dynamic', { waitUntil: false }).text()
    ).toBe('dynamic content')

    // The slow cache is still filling at this point, so its fallback is shown
    // and its content hasn't streamed in yet.
    expect(await browser.hasElementByCss('#cached-fallback')).toBe(true)
    expect(await browser.hasElementByCss('#cached')).toBe(false)

    // Eventually the cache fills and its content streams in. The fill takes
    // ~5s, so allow a longer wait than the default 5s selector timeout.
    expect(
      await browser
        .elementByCss('#cached', { waitUntil: false, timeout: 10000 })
        .text()
    ).toBeDateString()
  })

  it('does not show a Suspense fallback for runtime-prefetchable content on a client navigation', async () => {
    const browser = await next.browser('/')

    // Record whether each Suspense fallback ever enters the DOM during the
    // upcoming navigation. We inspect added nodes rather than the live DOM, so
    // a fallback that's added and then quickly replaced is still caught.
    const fallbackObserver = observeNodeAppearances(browser, [
      'runtime-fallback',
      'dynamic-fallback',
    ])
    await fallbackObserver.observe()

    await browser.elementByCss('a[href="/runtime-prefetch"]').click()

    // Wait for the navigation to fully settle.
    expect(
      await browser.elementByCss('#runtime', { waitUntil: false }).text()
    ).toBe('runtime content')
    expect(
      await browser.elementByCss('#dynamic', { waitUntil: false }).text()
    ).toBe('dynamic content')

    const appearanceCounts = await fallbackObserver.getResult()
    // The runtime-prefetchable content was resolved before the response started
    // streaming, so its fallback was never rendered; the dynamic content's
    // fallback was.
    expect(appearanceCounts).toEqual({
      'runtime-fallback': 0,
      'dynamic-fallback': 1,
    })
  })

  it('shows the private-cache fallback on a cold client navigation but not on a warm one', async () => {
    // Uses a runtime-prefetch route, whose cached content belongs to the
    // runtime shell stage. On a warm navigation the client defers revealing
    // the response (via `_revealAfter`) until the server has flushed the shell,
    // so the content arrives with the shell and the fallback isn't shown.
    const browser = await next.browser('/')

    // Cold navigation: the cache misses and fills in the background, so the
    // fallback is shown until the content streams in.
    await browser
      .elementByCss('a[href="/use-cache-private-runtime-prefetch"]')
      .click()
    expect(await browser.elementByCss('#private-fallback').text()).toBe(
      'Loading...'
    )
    expect(await browser.elementByCss('#private').text()).toBeDateString()

    // Wait for the background write to settle so the next navigation hits the
    // warm entry instead of racing a pending write.
    await waitFor(2000)

    // Hard-reload home so the first navigation below is a fresh, unknown-route
    // nav. An unknown route has no prior cache entry, so the server sends the
    // content inline in the seed (rather than the dynamic-only delta a known
    // route gets), and that inline reveal is gated on `_revealAfter` too, so
    // even this first nav delivers the content with the shell. Later iterations
    // navigate via back()/forward, exercising the known-route deferred-RSC
    // path.
    await browser.loadPage(new URL('/', next.url).href)

    // Warm navigation: record whether the fallback ever enters the DOM during
    // the navigation, even briefly. It shouldn't, since the warm content is
    // delivered with the shell.
    const fallbackObserver = observeNodeAppearances(browser, [
      'private-fallback',
    ])

    await fallbackObserver.observe()

    // Regression test for a rare client-side race the `_revealAfter` gate
    // fixes. The Flight client decodes the response incrementally, so before
    // the gate React Fiber could occasionally commit the fallback before the
    // children's row was processed, even though the warm content is delivered
    // with the shell. Deferring the reveal until `_revealAfter` settles means
    // the children are decoded by the time React reads them, so the fallback no
    // longer appears. The race was timing-dependent, so a single navigation
    // would catch a regression only by luck; we repeat the warm navigation many
    // times and assert the fallback never enters the DOM.
    for (let i = 0; i < 100; i++) {
      await browser
        .elementByCss('a[href="/use-cache-private-runtime-prefetch"]')
        .click()
      expect(await browser.elementByCss('#private').text()).toBeDateString()
      await browser.back()
    }

    const appearanceCounts = await fallbackObserver.getResult()
    expect(appearanceCounts).toEqual({
      'private-fallback': 0,
    })
  })

  it('shows the short-expire-cache fallback on a cold client navigation but not on a warm one', async () => {
    // A public `'use cache'` with an explicit short `expire` (`cacheLife({
    // expire: 0 })`) is a runtime-prefetch route here, so its cached content
    // belongs to the runtime shell stage. On a warm navigation the dev minimum
    // retention keeps the entry available, and the client defers revealing the
    // response until the shell has flushed, so the content arrives with the
    // shell and the fallback isn't shown - just like a private cache.
    const browser = await next.browser('/')

    // Cold navigation: the cache misses and fills in the background, so the
    // fallback is shown until the content streams in.
    await browser.elementByCss('a[href="/use-cache-expire-zero/nav"]').click()
    expect(await browser.elementByCss('#expire-zero-fallback').text()).toBe(
      'Loading...'
    )
    expect(await browser.elementByCss('#expire-zero').text()).toBeDateString()

    // Wait for the background write to settle so the next navigation hits the
    // warm entry instead of racing a pending write.
    await waitFor(2000)

    // Hard-reload home so the warm navigation below starts from a fresh page.
    await browser.loadPage(new URL('/', next.url).href)

    // Warm navigation: record whether the fallback ever enters the DOM. It
    // shouldn't, since the retained entry is delivered with the shell. (The
    // client-side reveal race that this delivery relies on is covered by the
    // private-cache test above, so we don't repeat its stress loop here.)
    const fallbackObserver = observeNodeAppearances(browser, [
      'expire-zero-fallback',
    ])

    await fallbackObserver.observe()

    await browser.elementByCss('a[href="/use-cache-expire-zero/nav"]').click()
    expect(await browser.elementByCss('#expire-zero').text()).toBeDateString()

    const appearanceCounts = await fallbackObserver.getResult()
    expect(appearanceCounts).toEqual({
      'expire-zero-fallback': 0,
    })
  })

  it('serves a short-expire cache warm on reload and converges to a fresh value', async () => {
    const browser = await next.browser('/use-cache-expire-zero/reload', {
      waitHydration: false,
      // Do not wait for "load"; inspect the page as it streams in.
      waitUntil: 'commit',
    })

    // Cold load: the cache misses, so the fallback streams first, and the
    // generated value streams in once generation completes. The value is a
    // dynamic hole (real `expire: 0`), so it streams in after the shell.
    expect(
      await browser
        .elementByCss('#expire-zero-fallback', { waitUntil: false })
        .text()
    ).toBe('Loading...')
    const coldValue = await browser
      .elementByCss('#expire-zero', { waitUntil: false })
      .text()
    expect(coldValue).toBeDateString()

    // Warm reload: the dev minimum retention keeps the short-expire entry, so
    // the reload serves the previously cached value fast instead of
    // regenerating it. A background revalidation regenerates a fresh entry for
    // the next reload (asserted below). We wait for the streamed-in element
    // without waiting for "load", so no retry is needed.
    await browser.refresh({ waitUntil: 'commit' })
    expect(
      await browser.elementByCss('#expire-zero', { waitUntil: false }).text()
    ).toBe(coldValue)

    // That warm reload re-warmed a fresh entry in the background, so a later
    // reload converges to the new value. Read after "load" here (a plain
    // refresh) since we want the settled value, not the streaming inspection
    // above.
    await retry(async () => {
      await browser.refresh()
      expect(await browser.elementById('expire-zero').text()).not.toBe(
        coldValue
      )
    })
  })

  // The following are smoke tests that Cache Components validation still
  // surfaces errors for both cold-cache renders (validated via a separate
  // warm-cache render) and warm-cache renders (validated via the streamed
  // render's own chunks). The full variety of validation errors is covered by
  // the cache-components-errors test suite.

  it('shows a validation redbox for uncached IO on cold and warm caches', async () => {
    const browser = await next.browser('/uncached-io')

    // Cold cache miss: validation runs against a separate warm-cache render.
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1401",
       "description": "Next.js encountered uncached data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/uncached-io/page.tsx (11:19) @ UncachedIO
     > 11 |   await setTimeout(100)
          |                   ^",
       "stack": [
         "UncachedIO app/uncached-io/page.tsx (11:19)",
         "Page app/uncached-io/page.tsx (21:7)",
       ],
     }
    `)

    // The cache filled while streaming; capture the value to confirm the
    // refresh is a hit.
    const cachedDate = await browser.elementByCss('#cached').text()
    expect(cachedDate).toBeDateString()

    await browser.refresh()

    // Warm cache hit: validation runs against the streamed render's own chunks,
    // and the cached value is re-served rather than recomputed.
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1401",
       "description": "Next.js encountered uncached data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/uncached-io/page.tsx (11:19) @ UncachedIO
     > 11 |   await setTimeout(100)
          |                   ^",
       "stack": [
         "UncachedIO app/uncached-io/page.tsx (11:19)",
         "Page app/uncached-io/page.tsx (21:7)",
       ],
     }
    `)
    expect(await browser.elementByCss('#cached').text()).toBe(cachedDate)
  })

  it('shows a validation redbox for sync IO on cold and warm caches', async () => {
    const browser = await next.browser('/sync-io')

    // Cold cache miss: validation runs against a separate warm-cache render.
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1295",
       "description": "Next.js encountered the unstable value Date() while prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/sync-io/page.tsx (11:24) @ SyncIO
     > 11 |   return <p id="sync">{Date()}</p>
          |                        ^",
       "stack": [
         "SyncIO app/sync-io/page.tsx (11:24)",
         "Page app/sync-io/page.tsx (20:7)",
       ],
     }
    `)

    // The cache filled while streaming; capture the value to confirm the
    // refresh is a hit.
    const cachedDate = await browser.elementByCss('#cached').text()
    expect(cachedDate).toBeDateString()

    await browser.refresh()

    // Warm cache hit: validation runs against the streamed render's own chunks,
    // and the cached value is re-served rather than recomputed.
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1295",
       "description": "Next.js encountered the unstable value Date() while prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/sync-io/page.tsx (11:24) @ SyncIO
     > 11 |   return <p id="sync">{Date()}</p>
          |                        ^",
       "stack": [
         "SyncIO app/sync-io/page.tsx (11:24)",
         "Page app/sync-io/page.tsx (20:7)",
       ],
     }
    `)
    expect(await browser.elementByCss('#cached').text()).toBe(cachedDate)
  })

  describe('partial prefetching', () => {
    it('does not show a Suspense fallback for session data on a client navigation (auto prefetch)', async () => {
      const browser = await next.browser('/')

      // Record whether each Suspense fallback ever enters the DOM during the
      // upcoming navigation.
      const fallbackObserver = observeNodeAppearances(browser, [
        'session-fallback',
        'dynamic-fallback',
      ])
      await fallbackObserver.observe()

      await browser
        .elementByCss('a[href="/partial-prefetching/session-data"]')
        .click()

      // Wait for the navigation to fully settle.
      expect(
        await browser.elementByCss('#session-data', { waitUntil: false }).text()
      ).toBe('session content')
      expect(
        await browser.elementByCss('#dynamic-data', { waitUntil: false }).text()
      ).toBe('dynamic content')

      const appearanceCounts = await fallbackObserver.getResult()
      // The runtime shell was resolved before the response started
      // streaming, so its fallback was never rendered; the dynamic content's
      // fallback was.
      expect(appearanceCounts).toEqual({
        'session-fallback': 0,
        'dynamic-fallback': 1,
      })
    })

    // TODO(app-shells): for some reason we can't observe the fallback here
    // even though all the stream unblocking logic seems to work as intended.
    it.failing(
      'shows a Suspense fallback for link data on a client navigation (auto prefetch)',
      async () => {
        const browser = await next.browser('/')

        // Record whether each Suspense fallback ever enters the DOM during the
        // upcoming navigation.
        const fallbackObserver = observeNodeAppearances(browser, [
          'session-fallback',
          'link-fallback',
          'dynamic-fallback',
        ])
        await fallbackObserver.observe()

        await browser
          .elementByCss(
            'a[href="/partial-prefetching/link-data?prefetch=auto"]'
          )
          .click()

        // Wait for the navigation to fully settle.
        expect(
          await browser.elementByCss('#link-data', { waitUntil: false }).text()
        ).toBe('link content')
        expect(
          await browser
            .elementByCss('#dynamic-data', { waitUntil: false })
            .text()
        ).toBe('dynamic content')

        const appearanceCounts = await fallbackObserver.getResult()
        expect(appearanceCounts).toEqual({
          'session-fallback': 0,
          'link-fallback': 1,
          'dynamic-fallback': 1,
        })
      }
    )
  })
})

function observeNodeAppearances(browser: Playwright, ids: string[]) {
  // Record whether each Suspense fallback ever enters the DOM during the
  // upcoming navigation. We inspect added nodes rather than the live DOM, so
  // a fallback that's added and then quickly replaced is still caught.
  type SeenCounts = Record<string, number>

  const observe = () =>
    browser.eval((ids: string[]) => {
      const seen: SeenCounts = Object.fromEntries(ids.map((id) => [id, 0]))

      ;(window as any).__seenNodes = seen
      const check = (node: Node) => {
        if (!(node instanceof Element)) {
          return
        }
        for (const id of ids) {
          if (node.id === id || node.querySelector(`#${id}`)) {
            seen[id] += 1
          }
        }
      }
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(check))
      }).observe(document.body, { childList: true, subtree: true })
    }, ids)

  const getResult = async (): Promise<SeenCounts> => {
    const seen: SeenCounts | undefined = await browser.eval(
      () => (window as any).__seenNodes
    )
    if (!seen) {
      throw new Error('Must call observe() before calling getResult()')
    }
    return seen
  }

  return { observe, getResult }
}
