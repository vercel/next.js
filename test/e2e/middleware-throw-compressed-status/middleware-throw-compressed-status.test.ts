import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * When middleware throws, the router sends a 500. If the client accepts gzip,
 * compression defers the real res.end(), the router's finished-check misses,
 * and the router used to fall through to `res.statusCode = 404` on the
 * already-sent response. The wire keeps the 500, so the corruption is only
 * visible inside the server process: everything reading res.statusCode on
 * 'finish' (APM tracers, access logs) records a 404 for a 500 the user saw.
 *
 * probe.js is injected into the server process via NODE_OPTIONS and prints the
 * status observed at 'finish', which is what these tests assert on.
 */
describe('middleware throw with a compressed response', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    env: {
      NODE_OPTIONS: '--require ./probe.js',
    },
  })

  if (isNextDeploy) {
    it('skips in deploy mode - the probe cannot be injected', () => {})
    return
  }

  it.each(['identity', 'gzip'])(
    'observes the sent 500 on finish (accept-encoding: %s)',
    async (acceptEncoding) => {
      const outputIndex = next.cliOutput.length

      const res = await next.fetch('/', {
        headers: { 'accept-encoding': acceptEncoding },
      })
      expect(res.status).toBe(500)

      await retry(() => {
        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain('PROBE_FINISH_STATUS=')
        expect(output).toContain('PROBE_FINISH_STATUS=500')
        expect(output).not.toContain('PROBE_FINISH_STATUS=404')
      })
    }
  )
})
