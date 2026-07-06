import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

const experimentalHeader = '- Experiments (use with caution):'
const pageContent = `export default () => 'hi'`

describe('Config Experimental Warning', () => {
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    describe('default config from function', () => {
      const { next } = nextTestSetup({
        files: {
          'pages/index.js': pageContent,
          'next.config.js': `
            module.exports = (phase, { defaultConfig }) => {
              return {
                ...defaultConfig,
                experimental: {
                  ...defaultConfig.experimental,
                  // We enable this by default in CI
                  strictRouteTypes: false,
                }
              }
            }
          `,
        },
      })

      it('should not show warning with default config from function', async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).not.toMatch(experimentalHeader)
      })
    })

    describe('config from object', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          images: {},
          experimental: {
            // We enable this in some CI shards
            strictRouteTypes: false,
            // We disable this in some CI shards
            appNewScrollHandler: true,
          },
        },
      })

      it('should not show warning with config from object', async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).not.toMatch(experimentalHeader)
      })
    })

    describe('config with workerThreads from object', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: {
            workerThreads: true,
          },
        },
      })

      it('should show warning with config from object with experimental', async () => {
        // Make a request to trigger experimental warnings display
        await next.fetch('/')
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' ✓ workerThreads')
      })
    })

    describe('config with workerThreads from function', () => {
      const { next } = nextTestSetup({
        files: {
          'pages/index.js': pageContent,
          'next.config.js': `
            module.exports = (phase) => ({
              experimental: {
                workerThreads: true
              }
            })
          `,
        },
      })

      it('should show warning with config from function with experimental', async () => {
        // Make a request to trigger experimental warnings display
        await next.fetch('/')
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' ✓ workerThreads')
      })
    })

    describe('config with default value', () => {
      const { next } = nextTestSetup({
        files: {
          'pages/index.js': pageContent,
          'next.config.js': `
            module.exports = (phase) => ({
              experimental: {
                workerThreads: false,
                // We enable this in some CI shards
                strictRouteTypes: false,
                // We disable this in some CI shards
                appNewScrollHandler: true,
              }
            })
          `,
        },
      })

      it('should not show warning with default value', async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).not.toContain(experimentalHeader)
        expect(output).not.toContain('workerThreads')
      })
    })

    describe('config with prerenderEarlyExit false', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: {
            prerenderEarlyExit: false,
          },
        },
      })

      it('should show warning with a symbol indicating that a default true value is set to false', async () => {
        // Make a request to trigger experimental warnings display
        await next.fetch('/')
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' ⨯ prerenderEarlyExit')
      })
    })

    describe('config with cpus', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: {
            cpus: 2,
          },
        },
      })

      it('should show the configured value for numerical features', async () => {
        // Make a request to trigger experimental warnings display
        await next.fetch('/')
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' · cpus: 2')
      })
    })

    // TODO: the incremental option has been removed, update to another string feature
    describe.skip('config with ppr incremental', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: {
            ppr: 'incremental',
          },
        },
      })

      it('should show the configured value for string features', async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' · ppr: "incremental"')
      })
    })

    describe('config with multiple experimental keys', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: {
            workerThreads: true,
            scrollRestoration: true,
          },
        },
      })

      it('should show warning with config from object with experimental and multiple keys', async () => {
        // Make a request to trigger experimental warnings display
        await next.fetch('/')
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain(experimentalHeader)
        expect(output).toContain(' ✓ workerThreads')
        expect(output).toContain(' ✓ scrollRestoration')
      })
    })
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    describe('next start output', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        nextConfig: {
          experimental: {
            workerThreads: true,
            scrollRestoration: true,
            parallelServerCompiles: true,
            cpus: 2,
          },
        },
      })

      it('should not show next app info in next start', async () => {
        await next.build()
        const startOffset = next.cliOutput.length
        await next.start()
        const output = stripAnsi(next.cliOutput.slice(startOffset))
        expect(output).not.toMatch(experimentalHeader)
      })
    })

    describe('next build output', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        nextConfig: {
          experimental: {
            workerThreads: true,
            scrollRestoration: true,
            parallelServerCompiles: true,
            prerenderEarlyExit: false,
            cpus: 2,
          },
        },
      })

      it('should show next app info with all experimental features in next build', async () => {
        await next.build()
        const output = stripAnsi(next.cliOutput)
        expect(output).toMatch(experimentalHeader)
        expect(output).toMatch(' · cpus: 2')
        expect(output).toMatch(' ✓ workerThreads')
        expect(output).toMatch(' ✓ scrollRestoration')
        expect(output).toMatch(' ⨯ prerenderEarlyExit')
        expect(output).toMatch(' ✓ parallelServerCompiles')
      })
    })

    describe('unrecognized experimental features', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        nextConfig: {
          experimental: {
            // @ts-expect-error - This is an intentional test
            appDir: true,
          },
        },
      })

      it('should show unrecognized experimental features in warning but not in start log experiments section', async () => {
        await next.build()
        const startOffset = next.cliOutput.length
        await next.start()
        const startOutput = stripAnsi(next.cliOutput.slice(startOffset))
        expect(startOutput).not.toContain(experimentalHeader)
        expect(stripAnsi(next.cliOutput)).toContain(
          `Unrecognized key(s) in object: 'appDir' at "experimental"`
        )
      })
    })
  })
})
