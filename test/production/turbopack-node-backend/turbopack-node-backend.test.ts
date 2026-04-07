import { nextTestSetup } from 'e2e-utils'

describe.each([
  ['forceWorkerThreads', true],
  ['childProcesses', false],
] as const)(
  'turbopack-node-backend (%s)',
  (turbopackPluginRuntimeStrategy, expectSamePid) => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      env: {
        TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY: turbopackPluginRuntimeStrategy,
      },
    })

    const itOnlyTurbopack = isTurbopack ? it : it.skip

    itOnlyTurbopack('should match expected loader pid behavior', async () => {
      const response = await next.fetch('/api/pid')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.buildPid).toBeDefined()
      expect(data.loaderPid).toBeDefined()

      if (expectSamePid) {
        expect(data.loaderPid).toBe(data.buildPid)
      } else {
        expect(data.loaderPid).not.toBe(data.buildPid)
      }
    })
  }
)
