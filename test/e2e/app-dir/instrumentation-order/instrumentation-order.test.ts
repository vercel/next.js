import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instrumentation-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should work', async () => {
    await next.fetch('/')

    await retry(async () => {
      const output = next.cliOutput

      // Verify instrumentation runs in correct order
      const instrumentationSideEffect = output.indexOf(
        'instrumentation:side-effect'
      )
      const instrumentationBegin = output.indexOf(
        'instrumentation:register:begin'
      )
      const instrumentationTimeout = output.indexOf(
        'instrumentation:register:timeout'
      )
      const instrumentationEnd = output.indexOf('instrumentation:register:end')
      // Find the global side effect that comes AFTER instrumentation
      const globalSideEffect = output.indexOf(
        'global-side-effect:app-router-page',
        instrumentationEnd
      )

      // All logs should be present
      expect(instrumentationSideEffect).toBeGreaterThan(-1)
      expect(instrumentationBegin).toBeGreaterThan(-1)
      expect(instrumentationTimeout).toBeGreaterThan(-1)
      expect(instrumentationEnd).toBeGreaterThan(-1)
      expect(globalSideEffect).toBeGreaterThan(-1)

      // Verify correct order: side-effect < begin < timeout < end < global-side-effect
      expect(instrumentationSideEffect).toBeLessThan(instrumentationBegin)
      expect(instrumentationBegin).toBeLessThan(instrumentationTimeout)
      expect(instrumentationTimeout).toBeLessThan(instrumentationEnd)
      expect(instrumentationEnd).toBeLessThan(globalSideEffect)
    })
  })
})
