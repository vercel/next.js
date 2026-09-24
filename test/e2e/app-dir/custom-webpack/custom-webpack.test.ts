import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const webpackVersions = ['5.98.0', '5.111.0']

for (const webpackVersion of webpackVersions) {
  // @force-gate webpack
  describe(`--custom-webpack with webpack ${webpackVersion}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        webpack: webpackVersion,
      },
      env: {
        EXPECTED_WEBPACK_VERSION: webpackVersion,
      },
      buildCommand: 'pnpm next build --custom-webpack',
      startCommand: isNextDev
        ? 'pnpm next dev --custom-webpack'
        : 'pnpm next start',
    })

    it('uses project webpack during config evaluation and compilation', async () => {
      const $ = await next.render$('/')
      expect($('#webpack-version').text()).toBe(
        `custom plugin with webpack ${webpackVersion}`
      )
      expect($('#replacement-message').text()).toBe(
        'replaced by NormalModuleReplacementPlugin'
      )
    })
  })
}

// @force-gate webpack
describe('--custom-webpack without a webpack dependency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
    buildCommand: 'pnpm next build --custom-webpack',
    startCommand: isNextDev
      ? 'pnpm next dev --custom-webpack'
      : 'pnpm next start',
    skipStart: true,
  })

  it('reports how to install webpack', async () => {
    await next.start().catch(() => {})
    await retry(() => {
      expect(next.cliOutput).toContain(
        '`--custom-webpack` requires webpack to be installed in your project'
      )
    })
  })
})

// @force-gate webpack
describe('--webpack without a webpack dependency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
    buildCommand: 'pnpm next build --webpack',
    startCommand: isNextDev ? 'pnpm next dev --webpack' : 'pnpm next start',
  })

  it('uses bundled webpack without requiring the peer dependency', async () => {
    const html = await next.render('/')
    expect(html).toContain('original module')
  })
})

for (const conflictingFlag of ['--webpack', '--turbopack']) {
  // @force-gate webpack
  describe(`--custom-webpack with ${conflictingFlag}`, () => {
    const command = `pnpm next ${isNextDev ? 'dev' : 'build'} --custom-webpack ${conflictingFlag}`
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {},
      buildCommand: command,
      startCommand: command,
      skipStart: true,
    })

    it('reports conflicting bundler flags', async () => {
      await next.start().catch(() => {})
      await retry(() => {
        expect(next.cliOutput).toContain('Multiple bundler flags set:')
        expect(next.cliOutput).toContain('--custom-webpack')
        expect(next.cliOutput).toContain(conflictingFlag)
      })
    })
  })
}
