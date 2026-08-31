import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('deprecation-warnings', () => {
  describe('without next.config.js', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/no-config'),
      skipStart: true,
    })

    it('should not emit any deprecation warnings when no config file exists', async () => {
      await next.start()

      // React version warnings are covered by the dedicated React version test.
      const configLogs = next.cliOutput
        .split('\n')
        .filter((line) => !line.includes('React 18 support is deprecated'))
        .join('\n')
      expect(configLogs).not.toContain('deprecated')
      expect(configLogs).not.toContain('has been renamed')
      expect(configLogs).not.toContain('no longer needed')
    })
  })

  describe('with deprecated config options', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/with-deprecated-config'),
      skipStart: true,
    })

    it('should emit deprecation warnings for explicitly configured deprecated options', async () => {
      await next.start()

      await retry(async () => {
        const logs = next.cliOutput

        // Should warn about experimental.instrumentationHook
        expect(logs).toContain('experimental.instrumentationHook')
        expect(logs).toContain('no longer needed')

        // Should warn about middleware config options
        expect(logs).toContain('experimental.middlewarePrefetch')
        expect(logs).toContain(
          'Please use `experimental.proxyPrefetch` instead'
        )

        expect(logs).toContain('experimental.middlewareClientMaxBodySize')
        expect(logs).toContain(
          'Please use `experimental.proxyClientMaxBodySize` instead'
        )

        expect(logs).toContain('experimental.externalMiddlewareRewritesResolve')
        expect(logs).toContain(
          'Please use `experimental.externalProxyRewritesResolve` instead'
        )

        expect(logs).toContain('skipMiddlewareUrlNormalize')
        expect(logs).toContain('Please use `skipProxyUrlNormalize` instead')
      })
    })
  })
})
