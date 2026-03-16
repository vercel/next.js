import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

const outputLogPath = 'output-log.json'

describe('on-request-error - isr with cacheComponents/PPR enabled', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should skip in development mode', () => {
      // This ISR test is only applicable for production mode
    })
    return
  }

  it('should capture ISR revalidation errors even with cacheComponents/PPR enabled', async () => {
    // Initial fetch succeeds (cached from build)
    const res1 = await next.fetch('/app/stale')
    expect(res1.status).toBe(200)

    // Wait for revalidation to occur
    await waitFor(2 * 1000)

    // Second fetch triggers background revalidation which throws an error
    await next.fetch('/app/stale')

    // Verify onRequestError was called with the error
    // This is the key assertion: with cacheComponents/PPR enabled, ISR revalidation
    // errors should trigger onRequestError (previously they were silently ignored)
    await retry(async () => {
      const json = await getOutputLogJson(next, outputLogPath)
      expect(json['ppr:stale']).toBeDefined()
      expect(json['ppr:stale'].message).toBe('ppr:stale')
      expect(json['ppr:stale'].context.routePath).toBe('/app/stale')
      expect(json['ppr:stale'].context.renderSource).toBe(
        'react-server-components'
      )
    })
  })
})
