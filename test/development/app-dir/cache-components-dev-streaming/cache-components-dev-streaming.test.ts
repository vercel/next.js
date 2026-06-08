import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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
    // the cache to be filled.
    expect(await browser.elementByCss('p').text()).toBe('Loading...')

    // Eventually, the cache content should be streamed in.
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBeDateString()
    })

    // Now that the cache is filled, it should be served immediately on the next
    // page load.
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBeDateString()
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
    // Use instant checks throughout: `elementByCss`/`elementById` also wait for
    // the page "load" event, which (with `waitUntil: 'commit'`) only fires once
    // the slow cache has filled — that would advance past the very window this
    // test inspects.
    await retry(async () => {
      expect(await browser.elementByCssInstant('#dynamic').text()).toBe(
        'dynamic content'
      )
    })

    // The slow cache is still filling at this point, so its fallback is shown
    // and its content hasn't streamed in yet.
    expect(await browser.hasElementByCss('#cached-fallback')).toBe(true)
    expect(await browser.hasElementByCss('#cached')).toBe(false)

    // Eventually the cache fills and its content streams in.
    await retry(async () => {
      expect(
        await browser.elementByCssInstant('#cached').text()
      ).toBeDateString()
    }, 10000)
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
       "code": "E1290",
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
       "code": "E1290",
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
})
