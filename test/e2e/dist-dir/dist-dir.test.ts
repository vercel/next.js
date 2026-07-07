import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { BUILD_ID_FILE, BUILD_MANIFEST } from 'next/constants'

describe('distDir', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should render the page', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/Hello World/)
  })

  it('should build the app within the given `dist` directory', async () => {
    if (isNextDev) {
      expect(await next.hasFile(`dist/dev/${BUILD_MANIFEST}`)).toBe(true)
    } else {
      expect(await next.hasFile(`dist/${BUILD_ID_FILE}`)).toBe(true)
    }
  })

  it('should not build the app within the default `.next` directory', async () => {
    expect(await next.hasFile('.next')).toBe(false)
  })
})

if (isNextStart) {
  describe('distDir config validation', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should throw error with invalid distDir', async () => {
      const origConfig = await next.readFile('next.config.js')
      await next.patchFile('next.config.js', `module.exports = { distDir: '' }`)
      const { cliOutput } = await next.build()
      await next.patchFile('next.config.js', origConfig)

      expect(cliOutput).toContain(
        'Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined'
      )
    })

    it('should handle undefined distDir', async () => {
      const origConfig = await next.readFile('next.config.js')
      await next.patchFile(
        'next.config.js',
        `module.exports = { distDir: undefined }`
      )
      const { cliOutput } = await next.build()
      await next.patchFile('next.config.js', origConfig)

      expect(cliOutput).not.toContain('Invalid distDir')
    })
  })
}
