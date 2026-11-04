import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

// Only Turbopack reports this warning
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'build-tracing-unresolved-package',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should warn when a traced package does not resolve to a file', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const cliOutput = stripAnsi(next.cliOutput)
      expect(cliOutput).toContain('Turbopack build encountered 1 warning:')
      expect(cliOutput).toContain('./app/api/render/route.js')
      expect(cliOutput).toContain(
        'Traced dependency node_modules/broken-child could not be resolved'
      )
      expect(cliOutput).toContain(
        'node_modules/traced-parent/index.js requires this package'
      )

      // Only the package.json of the broken package is traced
      const trace = await next.readJSON(
        '.next/server/app/api/render/route.js.nft.json'
      )
      expect(
        trace.files.filter((file: string) => file.includes('broken-child'))
      ).toEqual([
        expect.stringMatching(/node_modules\/broken-child\/package\.json$/),
      ])
    })
  }
)
