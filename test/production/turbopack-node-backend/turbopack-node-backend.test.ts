import { nextTestSetup } from 'e2e-utils'

// This is a Turbopack-specific option
// @force-gate turbopack
describe.each([
  ['workerThreads', true],
  ['childProcesses', false],
] as const)(
  'turbopack-node-backend (%s)',
  (turbopackPluginRuntimeStrategy, expectSamePid) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY: turbopackPluginRuntimeStrategy,
      },
    })

    it('should match expected loader pid behavior', async () => {
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
