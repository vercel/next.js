import { nextTestSetup } from 'e2e-utils'

describe('Build warnings', () => {
  describe('minification warnings', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should not show warning about minification without any modification', async () => {
      const start = next.cliOutput.length
      await next.build()
      expect(next.cliOutput.slice(start)).not.toContain(
        'optimization has been disabled'
      )
    })
    ;(isTurbopack ? it.skip : it)(
      'should show warning about minification for minimize',
      async () => {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
  webpack: (config) => {
    config.optimization.minimize = false
    return config
  },
}`
        )
        const start = next.cliOutput.length
        await next.build()
        // eslint-disable-next-line jest/no-standalone-expect
        expect(next.cliOutput.slice(start)).toContain(
          'optimization has been disabled'
        )
      }
    )
    ;(isTurbopack ? it.skip : it)(
      'should show warning about minification for minimizer',
      async () => {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
  webpack: (config) => {
    config.optimization.minimizer = []
    return config
  },
}`
        )
        const start = next.cliOutput.length
        await next.build()
        // eslint-disable-next-line jest/no-standalone-expect
        expect(next.cliOutput.slice(start)).toContain(
          'optimization has been disabled'
        )
      }
    )
  })

  describe('cache warnings', () => {
    describe('non-CI environment', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        env: {
          CI: '',
          CIRCLECI: '',
          TRAVIS: '',
          SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: '',
          GITHUB_ACTIONS: '',
          GITHUB_EVENT_NAME: '',
        },
      })

      it('should not warn about missing cache in non-CI', async () => {
        await next.build()
        expect(next.cliOutput).not.toContain('no-cache')
      })
    })

    describe('supported platforms', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        env: { CI: '1', NOW_BUILDER: '1' },
      })

      it('should not warn about missing cache on supported platforms', async () => {
        await next.build()
        expect(next.cliOutput).not.toContain('no-cache')
      })
    })

    describe('CI environment', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        env: { CI: '1' },
      })

      it('should warn about missing cache in CI', async () => {
        await next.build()
        expect(next.cliOutput).toContain('no-cache')

        const start = next.cliOutput.length
        await next.build()
        expect(next.cliOutput.slice(start)).not.toContain('no-cache')
      })
    })
  })
})
