import { nextTestSetup } from 'e2e-utils'

describe('Page Extensions', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should use the default pageExtensions if set to undefined', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = { pageExtensions: undefined }`
      )

      await next.build()

      expect(next.cliOutput).toContain('Compiled successfully')
    })

    it('should throw if pageExtensions is an empty array', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = { pageExtensions: [] }`
      )

      await next.build()

      expect(next.cliOutput).toContain(
        'Specified pageExtensions is an empty array. Please update it with the relevant extensions or remove it'
      )
    })

    it('should throw if pageExtensions has invalid extensions', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = { pageExtensions: ['js', 123] }`
      )

      await next.build()

      expect(next.cliOutput).toContain(
        'Specified pageExtensions is not an array of strings, found "123" of type "number". Please update this config or remove it'
      )
    })

    it('should not throw if .d.ts file inside the pages folder', async () => {
      await next.patchFile(
        'next.config.js',
        `module.exports = { pageExtensions: ['js', 'ts', 'tsx'] }`
      )

      await next.build()

      expect(next.cliOutput).toContain('Compiled successfully')
    })
  })
})
