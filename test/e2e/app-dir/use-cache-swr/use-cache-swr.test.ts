import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-swr', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  let outputIndex: number

  beforeEach(() => {
    outputIndex = next.cliOutput.length
  })

  it('should serve stale data and then pre-warmed data on subsequent request', async () => {
    const browser = await next.browser('/')
    const initialOuter = await browser.elementById('outer-data').text()
    expect(initialOuter).toBeDateString()

    // Wait for the outer cache to go stale (revalidate: 5).
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Reset output index so the regen set we poll for below can't be satisfied
    // by the initial cold-fill set from the first fetch.
    outputIndex = next.cliOutput.length

    // This request should trigger SWR: the handler returns the stale entry,
    // the framework serves it to the client, and kicks off a background regen.
    await browser.refresh()
    const afterStale = await browser.elementById('outer-data').text()

    // The stale data should be the same as the initial data.
    expect(afterStale).toBe(initialOuter)

    // Wait for the background regen to complete by polling for its set log.
    await retry(() => {
      const regenOutput = next.cliOutput.slice(outputIndex)
      expect(regenOutput).toMatch(/PersistentCacheHandler::set.*"outer"/)
    })

    // Reset output index to capture only the next request's handler logs.
    outputIndex = next.cliOutput.length

    // Refresh again. The pre-warmed entry from the SWR regen should be served.
    await browser.refresh()
    const afterRegen = await browser.elementById('outer-data').text()

    // The data should now be fresh (different from the stale data).
    expect(afterRegen).not.toBe(initialOuter)

    // Verify this was served from the pre-warmed cache (get hit, no set).
    const cliOutput = next.cliOutput.slice(outputIndex)
    expect(cliOutput).toMatch(/PersistentCacheHandler::get.*"outer".*-> hit/)
    expect(cliOutput).not.toMatch(/PersistentCacheHandler::set.*"outer"/)
  })

  it('should serve stale data without blocking on the background regeneration', async () => {
    // Fetch 1: cold cache. The cached component blocks for ~1s.
    const $1 = await next.render$('/delayed')
    const cached1 = $1('#cached').text()
    const dynamic1 = $1('#dynamic').text()
    expect(cached1).toBeDateString()
    expect(dynamic1).toBeDateString()

    // Wait past the 1s revalidate window (cacheLife('seconds')).
    await new Promise((resolve) => setTimeout(resolve, 1200))

    outputIndex = next.cliOutput.length

    // Fetch 2: stale hit. Should return the stale entry immediately and kick
    // off the regeneration in the background, rather than blocking on the 1s
    // delay in the cached component.
    const start2 = Date.now()
    const $2 = await next.render$('/delayed')
    const duration2 = Date.now() - start2
    const cached2 = $2('#cached').text()
    const dynamic2 = $2('#dynamic').text()

    expect(cached2).toBe(cached1)
    expect(dynamic2).not.toBe(dynamic1)
    expect(duration2).toBeLessThan(1000)

    // Wait for the background regen to finish writing the fresh entry.
    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toMatch(
        /PersistentCacheHandler::set/
      )
    })

    // Fetch 3: should serve the pre-warmed fresh entry from the background
    // regen, not a new stale value.
    const start3 = Date.now()
    const $3 = await next.render$('/delayed')
    const duration3 = Date.now() - start3
    const cached3 = $3('#cached').text()
    const dynamic3 = $3('#dynamic').text()

    expect(cached3).not.toBe(cached1)
    expect(dynamic3).not.toBe(dynamic2)
    expect(duration3).toBeLessThan(1000)
  })

  it('should serve stale data without blocking on the background regeneration (route handler)', async () => {
    // Fetch 1: cold cache. The cached function blocks for ~1s.
    const res1 = await next.fetch('/delayed-route')
    const { cached: cached1, dynamic: dynamic1 } = await res1.json()
    expect(cached1).toBeDateString()
    expect(dynamic1).toBeDateString()

    // Wait past the 1s revalidate window (cacheLife('seconds')).
    await new Promise((resolve) => setTimeout(resolve, 1200))

    outputIndex = next.cliOutput.length

    // Fetch 2: stale hit. Should return the stale entry immediately and kick
    // off the regeneration in the background, rather than blocking on the 1s
    // delay in the cached function.
    const start2 = Date.now()
    const res2 = await next.fetch('/delayed-route')
    const { cached: cached2, dynamic: dynamic2 } = await res2.json()
    const duration2 = Date.now() - start2

    expect(cached2).toBe(cached1)
    expect(dynamic2).not.toBe(dynamic1)
    expect(duration2).toBeLessThan(1000)

    // Wait for the background regen to finish writing the fresh entry.
    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toMatch(
        /PersistentCacheHandler::set/
      )
    })

    // Fetch 3: should serve the pre-warmed fresh entry from the background
    // regen, not a new stale value.
    const start3 = Date.now()
    const res3 = await next.fetch('/delayed-route')
    const { cached: cached3, dynamic: dynamic3 } = await res3.json()
    const duration3 = Date.now() - start3

    expect(cached3).not.toBe(cached1)
    expect(dynamic3).not.toBe(dynamic2)
    expect(duration3).toBeLessThan(1000)
  })

  it('should pass implicit tags to cache handler get() for nested caches during SWR', async () => {
    const browser = await next.browser('/')
    await browser.elementById('outer-data').text()

    // Wait for the outer cache to go stale (revalidate: 5).
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Reset output index to capture only the SWR-related logs.
    outputIndex = next.cliOutput.length

    // This triggers SWR: stale outer is served, background regen starts.
    // During regen, the outer fn re-executes and calls the inner "use cache".
    // The inner cache's get() should receive the page's implicit tags.
    await browser.refresh()

    // Wait for the background regen to complete.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const cliOutput = next.cliOutput.slice(outputIndex)

    // The inner cache's get() during SWR regen should include the page's
    // implicit tags (softTags), not an empty array. We identify the inner
    // cache by its "inner" sentinel argument in the key.
    expect(cliOutput).toMatch(/PersistentCacheHandler::get.*"inner".*_N_T_\//)
  })

  it('should dedupe SWR regens across concurrent requests', async () => {
    const browser = await next.browser('/')
    await browser.elementById('outer-data').text()

    // Wait for the outer cache to go stale (revalidate: 5).
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Reset output index to capture only the SWR-related logs.
    outputIndex = next.cliOutput.length

    // Fire multiple concurrent requests that all find the stale entry.
    // Only one of them should trigger a background regen.
    await Promise.all([next.fetch('/'), next.fetch('/'), next.fetch('/')])

    // Wait for the background regen to complete.
    await retry(() => {
      const regenOutput = next.cliOutput.slice(outputIndex)
      expect(regenOutput).toInclude('use-cache-swr: generating outer data')
    })

    const cliOutput = next.cliOutput.slice(outputIndex)

    // The cache function should have been executed only once across all
    // concurrent requests, not once per request.
    const generationCalls = cliOutput.split('\n').filter(
      (line) =>
        line.includes('use-cache-swr: generating outer data') &&
        // Ignore replayed logs that have a Cache badge.
        !line.includes(' Cache ')
    )
    expect(generationCalls).toHaveLength(1)
  })
})
