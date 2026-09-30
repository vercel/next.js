import { nextTestSetup, isNextDev, isNextStart, isNextDeploy } from 'e2e-utils'
import { BUILD_ID_FILE, BUILD_MANIFEST } from 'next/constants'

describe('distDir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm build-and-check',
    packageJson: {
      scripts: {
        'build-and-check': 'next build && node check-build.js',
      },
    },
  })

  it('should render the page', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/Hello World/)
  })

  it('should build the app within the given `dist` directory', async () => {
    if (isNextDeploy) {
      // The build runs remotely, so inspect the checks from that filesystem.
      expect(next.cliOutput).toContain('Found dist/BUILD_ID')
    } else if (isNextDev) {
      expect(await next.hasFile(`dist/dev/${BUILD_MANIFEST}`)).toBe(true)
    } else {
      expect(await next.hasFile(`dist/${BUILD_ID_FILE}`)).toBe(true)
    }
  })

  it('should not build the app within the default `.next` directory', async () => {
    if (isNextDeploy) {
      expect(next.cliOutput).toContain('No .next directory')
    } else {
      expect(await next.hasFile('.next')).toBe(false)
    }
  })
})

if (isNextStart) {
  describe('distDir config validation', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

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
