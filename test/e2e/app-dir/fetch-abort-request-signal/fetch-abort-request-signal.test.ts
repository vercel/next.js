import { nextTestSetup } from 'e2e-utils'

describe('fetch-abort-request-signal', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // This test starts a local HTTP server and forces GC inside the server.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it.each(['url', 'request'])(
    'should abort fetch with a signal for a %s input after a GC',
    async (mode) => {
      const res = await next.fetch(`/api?mode=${mode}`)
      const { result, elapsed } = await res.json()

      expect(result).toBe('AbortError')
      expect(elapsed).toBeLessThan(4000)
    }
  )
})
