import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const EXPECTED_WARNING =
  'The Edge Runtime is deprecated. You can use the "nodejs" runtime instead.'

describe('edge-runtime-deprecated', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should warn about deprecated edge runtime', async () => {
    if (isNextDev) {
      // In dev mode, the warning fires when the edge route is first compiled.
      await next.fetch('/edge-route')
    }

    await retry(async () => {
      expect(next.cliOutput).toContain(EXPECTED_WARNING)
    })
  })

  it('should only warn once', async () => {
    if (isNextDev) {
      // Trigger compilation of the edge route again (already compiled, but
      // another request ensures no duplicate warnings).
      await next.fetch('/edge-route')
    }

    await retry(async () => {
      expect(next.cliOutput).toContain(EXPECTED_WARNING)
    })

    const occurrences = next.cliOutput.split(EXPECTED_WARNING).length - 1
    expect(occurrences).toBe(1)
  })
})
