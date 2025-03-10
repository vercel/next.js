import { nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'

// Turbopack hasn't fully enabled this option yet
;(process.env.TURBOPACK ? describe.skip : describe)(
  'next-config-warnings - esm-externals-false',
  () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_TELEMETRY_DEBUG: '1',
      },
    })

    it('should warn when using ESM externals: false', async () => {
      await next.fetch('/')

      expect(next.cliOutput).toContain(
        `The "experimental.esmExternals" option has been modified. experimental.esmExternals is not recommended to be modified as it may disrupt module resolution. It should be removed from your next.config.js`
      )
    })

    if (isNextStart) {
      it('should contain esmExternals feature usage in telemetry', async () => {
        const featureUsageEvents = findAllTelemetryEvents(
          next.cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(featureUsageEvents).toContainEqual({
          featureName: 'esmExternals',
          invocationCount: 1,
        })
      })
    }
  }
)
