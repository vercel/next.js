import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Webpack - Bun Externals',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    let buildExitCode: number

    beforeAll(async () => {
      const result = await next.build()
      buildExitCode = typeof result.exitCode === 'number' ? result.exitCode : -1
    })

    it('should successfully build with Bun module imports', () => {
      expect(buildExitCode).toBe(0)
    })

    it('should externalize Bun builtins in server bundles', async () => {
      const serverBundle = await next.readFile('.next/server/pages/index.js')

      const bunModules = [
        'bun:ffi',
        'bun:jsc',
        'bun:sqlite',
        'bun:test',
        'bun:wrap',
        'bun',
      ]

      bunModules.forEach((mod) => {
        const escapedMod = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        expect(serverBundle).toInclude(`require("${escapedMod}")`)
      })
    })

    it('should not bundle Bun module implementations', async () => {
      const serverBundle = await next.readFile('.next/server/pages/index.js')

      expect(serverBundle).not.toContain('__webpack_require__.resolve("bun")')
    })
  }
)
