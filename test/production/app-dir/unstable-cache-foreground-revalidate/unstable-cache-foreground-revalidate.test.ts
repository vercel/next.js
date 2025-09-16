import { nextTestSetup } from 'e2e-utils'

describe('unstable-cache-foreground-revalidate', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (isNextDev) {
    it.skip('should not run in dev mode', () => {})
    return
  }

  it('should block and wait for fresh data when ISR page revalidate time is greater than unstable_cache TTL', async () => {
    // Initial render to warm up cache
    await next.render('/isr-10')

    // Record initial log position
    const initialLogLength = next.cliOutput.length

    // Wait for both ISR and unstable_cache to become stale
    await new Promise((resolve) => setTimeout(resolve, 11000))

    // This request triggers ISR background revalidation
    await next.render('/isr-10')

    // Wait for ISR background revalidation to complete
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get logs since the initial render
    const logs = next.cliOutput.substring(initialLogLength)

    const cacheExecutions = [
      ...logs.matchAll(/\[TEST\] unstable_cache callback executed at: (\d+)/g),
    ]
    const completions = [
      ...logs.matchAll(
        /\[TEST\] Page render completed with cache data from: (\d+)/g
      ),
    ]

    if (completions.length === 0) {
      throw new Error('No page completions found in logs')
    }

    const lastCompletion = completions[completions.length - 1]
    const lastCacheExecution =
      cacheExecutions.length > 0
        ? cacheExecutions[cacheExecutions.length - 1]
        : null

    if (!lastCacheExecution) {
      throw new Error(
        `Expected cache execution during ISR revalidation but found none. ` +
          `Cache executions: ${cacheExecutions.length}, Page completions: ${completions.length}`
      )
    }

    const cacheExecutedAt = parseInt(lastCacheExecution[1])
    const cacheDataFrom = parseInt(lastCompletion[1])
    const timeDiff = Math.abs(cacheExecutedAt - cacheDataFrom)

    console.log('ISR revalidation timing:')
    console.log('- Cache executed at:', cacheExecutedAt)
    console.log('- ISR used cache data from:', cacheDataFrom)
    console.log('- Time difference:', timeDiff, 'ms')

    // With foreground revalidation:
    // - ISR waits for fresh data, so timestamps should match (< 1000ms difference)
    // Without foreground revalidation:
    // - ISR uses stale data, so timestamps will be far apart (> 10000ms)
    expect(timeDiff).toBeLessThan(1000)
  })
})
