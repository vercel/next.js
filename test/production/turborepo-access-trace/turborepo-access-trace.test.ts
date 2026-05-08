import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('build with proxy trace', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: path.join(__dirname, 'app'),
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should build and output trace correctly', async () => {
      const { exitCode } = await next.build({
        env: {
          TURBOREPO_TRACE_FILE: '.turbo/turborepo-trace.json',
          SSG_ROUTE_ENV_VAR_HEADER_TEXT: 'Welcome',
        },
      })
      expect(exitCode).toBe(0)

      const accessTrace = JSON.parse(
        await next.readFile('.turbo/turborepo-trace.json')
      )
      expect(accessTrace.outputs).toStrictEqual(['dist/**', '!dist/cache/**'])
      expect(accessTrace.accessed.envVarKeys).toBeArray()
      expect(accessTrace.accessed.envVarKeys).toContain(
        'SSG_ROUTE_ENV_VAR_HEADER_TEXT'
      )
      expect(accessTrace.accessed.network).toBeFalse()
      expect(accessTrace.accessed.filePaths).toBeArray()
    })
  })
})
