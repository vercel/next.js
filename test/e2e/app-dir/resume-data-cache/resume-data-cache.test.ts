import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

describe('resume-data-cache', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it.each([
    { name: 'use cache', id: 'random-number' },
    { name: 'fetch cache', id: 'another-random-number' },
  ])(
    'should have consistent data between static and dynamic renders with $name',
    async ({ id }) => {
      // First render the page statically, getting the random number from the
      // HTML.
      let $ = await next.render$('/')
      const first = $(`p#${id}`).text()

      // Then get the Prefetch RSC and validate that it also contains the same
      // random number.
      await retry(async () => {
        const url = new URL('/', 'http://localhost')

        url.searchParams.set(
          '_rsc',
          computeCacheBustingSearchParam('1', '/__PAGE__', undefined, undefined)
        )

        const rsc = await next
          .fetch(url.toString(), {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
              'Next-Router-Segment-Prefetch': '/__PAGE__',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then get the dynamic RSC and validate that it also contains the same
      // random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(first)
      })

      // Then revalidate the page. Note: Dynamic RSC requests don't trigger
      // actual revalidation - they only mark tags as needing revalidation.
      // The actual revalidation only occurs when accessing a static resource again.
      await next.fetch('/revalidate', { method: 'POST' })

      // Then get the dynamic RSC again and validate that it still contains the
      // same random number. The first request will get the stale data, but the
      // second request will get the fresh data as it'll eventually have
      // revalidated.
      const rsc = await next
        .fetch('/', {
          headers: {
            RSC: '1',
          },
        })
        .then((res) => res.text())
      expect(rsc).toContain(first)

      // We then expect after the background revalidation has been completed,
      // the dynamic RSC to get the fresh data.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).not.toContain(first)
      })

      // This proves that the dynamic RSC was able to use the resume data cache
      // (RDC) from the static render to ensure that the data is consistent
      // between the static and dynamic renders. Let's now try to render the
      // page statically and see that the random number changes.

      $ = await next.render$('/')
      const random2 = $(`p#${id}`).text()
      expect(random2).not.toBe(first)

      // Then get the Prefetch RSC and validate that it also contains the new
      // random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
              'Next-Router-Segment-Prefetch': '/__PAGE__',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(random2)
      })

      // Then get the dynamic RSC again and validate that it also contains the
      // new random number.
      await retry(async () => {
        const rsc = await next
          .fetch('/', {
            headers: {
              RSC: '1',
            },
          })
          .then((res) => res.text())
        expect(rsc).toContain(random2)
      })

      // This proves that the dynamic RSC was able to use the resume data cache
      // (RDC) from the static render to ensure that the data is consistent
      // between the static and dynamic renders.
    }
  )

  // TODO: Re-enable this test once necessary upstream changes are merged to support this
  if (!isNextDeploy) {
    it('should use RDC for server action re-renders', async () => {
      const browser = await next.browser('/server-action')

      // Get the initial values
      const initialCachedValue = await browser
        .elementByCss('#cached-random')
        .text()
      const initialUncachedValue = await browser
        .elementByCss('#uncached-random')
        .text()

      await browser.elementByCss('#refresh-button').click()

      // Wait for the action to complete and verify:
      // 1. The uncached value should change
      // 2. The cached value should remain the same (proving RDC is being used)
      await retry(async () => {
        const cachedValueAfterAction = await browser
          .elementByCss('#cached-random')
          .text()
        const uncachedValueAfterAction = await browser
          .elementByCss('#uncached-random')
          .text()

        // Uncached value should have changed - this proves the action caused a re-render
        expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

        // Cached value should remain the same - this proves the RDC is being used
        // to maintain consistency during server action re-renders
        expect(cachedValueAfterAction).toBe(initialCachedValue)
      })
    })
  }

  it('should see fresh data after updateTag in server action with use cache', async () => {
    // This test verifies that when a server action calls updateTag(),
    // the subsequent re-render sees fresh data instead of stale RDC data.
    // This is the "read your own writes" behavior for 'use cache'.

    const browser = await next.browser('/revalidate-action')

    // Get the initial cached value from the page render
    const initialCachedValue = await browser
      .elementByCss('#cached-value')
      .text()
    const initialUncachedValue = await browser
      .elementByCss('#uncached-value')
      .text()

    // Click the revalidate button to trigger the server action
    await browser.elementByCss('#revalidate-button').click()

    // Wait for the re-render and verify:
    // 1. The uncached value should change (proves re-render happened)
    // 2. The cached value should ALSO change (proves updateTag was respected)
    await retry(async () => {
      const cachedValueAfterAction = await browser
        .elementByCss('#cached-value')
        .text()
      const uncachedValueAfterAction = await browser
        .elementByCss('#uncached-value')
        .text()

      // Uncached value should change - this proves the action triggered a re-render
      expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

      // Cached value should also change, which proves that the RDC read respected
      // pendingRevalidatedTags and fetched fresh data instead of returning
      // the stale value from the RDC.
      // If this fails, it means the RDC is not respecting updateTag()
      // calls made during server actions
      expect(cachedValueAfterAction).not.toBe(initialCachedValue)
    })
  })

  it('should see fresh data after updateTag in server action with fetch cache', async () => {
    // This test verifies that when a server action calls updateTag(),
    // the subsequent re-render sees fresh data instead of stale RDC data.
    // This is the "read your own writes" behavior for fetch cache.

    const browser = await next.browser('/revalidate-fetch-action')

    // Get the initial cached value from the page render
    const initialCachedValue = await browser
      .elementByCss('#cached-value')
      .text()
    const initialUncachedValue = await browser
      .elementByCss('#uncached-value')
      .text()

    // Click the revalidate button to trigger the server action
    await browser.elementByCss('#revalidate-button').click()

    // Wait for the re-render and verify:
    // 1. The uncached value should change (proves re-render happened)
    // 2. The cached value should ALSO change (proves updateTag was respected)
    await retry(async () => {
      const cachedValueAfterAction = await browser
        .elementByCss('#cached-value')
        .text()
      const uncachedValueAfterAction = await browser
        .elementByCss('#uncached-value')
        .text()

      // Uncached value should change - this proves the action triggered a re-render
      expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

      // Cached value should also change, which proves that the RDC read respected
      // pendingRevalidatedTags and fetched fresh data instead of returning
      // the stale value from the RDC.
      // If this fails, it means the RDC is not respecting updateTag()
      // calls made during server actions
      expect(cachedValueAfterAction).not.toBe(initialCachedValue)
    })
  })
})
