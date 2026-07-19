import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('output-export-async-route-module', () => {
  describe('invalid route', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'invalid'),
      skipStart: true,
    })

    // The route module uses top-level await, so its `output: 'export'`
    // validation runs after the module settles instead of throwing during
    // require(). The resulting error must still fail the build.
    it('fails the build when an async route module is not statically exportable', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'not configured on route "/api/data" with "output: export"'
      )
      expect(exitCode).toBe(1)
    })
  })

  describe('valid route', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'valid'),
      skipStart: true,
    })

    it('exports an async route module that is statically exportable', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      expect(await next.readFile('out/api/data')).toBe('{"ok":true}')
    })
  })
})
