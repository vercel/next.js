/**
 * Drives the client segment cache in a real built app through the real UI:
 * reveal waves of links (prefetch scheduling, cache-key creation, cache
 * fills, LRU churn), then navigate across the prefetched routes (cache
 * reads, route-tree conversion), including repeat visits and history
 * traversals (bfcache).
 *
 * The driver is deliberately coupled only to the fixture's DOM, never to
 * Next.js internals. It verifies via network traffic that the workload
 * actually exercised the cache, so a silent behavior change can't turn this
 * into a benchmark of nothing.
 */

// Floors, not targets: prefetch requests dedupe heavily across batches
// (repeated routes, shared segments, response inlining), so the observed
// count is far below the link count. These exist only to catch the workload
// silently exercising nothing.
const MIN_PREFETCH_REQUESTS = 25
const MIN_NAVIGATIONS = 20

export default {
  type: 'browser',
  app: 'app',
  filter: ['client/components/segment-cache'],
  async drive({ page, baseURL }) {
    const stats = { prefetchRequests: 0, navigations: 0 }
    page.on('request', (request) => {
      const headers = request.headers()
      if (
        headers['next-router-prefetch'] !== undefined ||
        headers['next-router-segment-prefetch'] !== undefined
      ) {
        stats.prefetchRequests++
      }
    })

    // Waits until no new prefetch request has been observed for `quietMs`.
    const settlePrefetches = async (quietMs = 1_000, timeoutMs = 30_000) => {
      const deadline = Date.now() + timeoutMs
      let last = stats.prefetchRequests
      let lastChange = Date.now()
      while (Date.now() < deadline) {
        await page.waitForTimeout(100)
        if (stats.prefetchRequests !== last) {
          last = stats.prefetchRequests
          lastChange = Date.now()
        } else if (Date.now() - lastChange >= quietMs) {
          return
        }
      }
    }

    const navigateTo = async (href, expectHeading) => {
      await page.click(`a[href="${href}"]`)
      await page.waitForURL(`**${href}`)
      if (expectHeading) {
        await page.waitForSelector(`h1:has-text("${expectHeading}")`)
      }
      stats.navigations++
    }

    await page.goto(baseURL + '/')
    await page.waitForSelector('#reveal-next-batch')

    const batchCount = Number(
      await page.getAttribute('[data-batch-count]', 'data-batch-count')
    )

    for (let batch = 0; batch < batchCount; batch++) {
      // Reveal the next wave of links; every link entering the viewport
      // schedules prefetch tasks.
      await page.click('#reveal-next-batch')
      await page.waitForSelector(`ul[data-batch="${batch}"]`)
      await settlePrefetches()

      // Navigate a sample of the newly prefetched routes. The nav links live
      // in the persistent root layout, so they stay mounted across
      // navigations. Batch 0 doubles as warmup: functions need to tier up
      // to optimized code before deopts can happen at all.
      const hrefs = await page.$$eval(`ul[data-batch="${batch}"] a`, (as) =>
        as.map((a) => a.getAttribute('href'))
      )
      const sample = hrefs.filter((_, i) => i % 5 === 0)
      for (const href of sample) {
        await navigateTo(href)
      }

      // Revisit an already-visited route (cache hit path)…
      if (sample.length > 1) {
        await navigateTo(sample[0])
      }
      // …exercise the parallel-routes tree…
      await navigateTo('/dash', 'dash')
      await navigateTo('/dash/settings', 'dash settings')
      // …and history traversal (bfcache restore paths).
      await page.goBack()
      await page.waitForURL('**/dash')
      await page.goForward()
      await page.waitForURL('**/dash/settings')
      await navigateTo('/', 'segment-cache deopt workload')
    }

    await settlePrefetches()

    if (
      stats.prefetchRequests < MIN_PREFETCH_REQUESTS ||
      stats.navigations < MIN_NAVIGATIONS
    ) {
      throw new Error(
        `Workload did not exercise the segment cache as expected: ` +
          `${stats.prefetchRequests} prefetch requests (want >= ${MIN_PREFETCH_REQUESTS}), ` +
          `${stats.navigations} navigations (want >= ${MIN_NAVIGATIONS}). ` +
          `Did prefetching or the fixture's link markup change?`
      )
    }
    console.error(
      `[bench-deopt] workload: ${stats.prefetchRequests} prefetch requests, ${stats.navigations} navigations`
    )
  },
}
