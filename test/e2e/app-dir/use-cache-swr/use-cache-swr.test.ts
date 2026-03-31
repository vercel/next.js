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
})
