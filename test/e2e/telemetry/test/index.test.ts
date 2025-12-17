import path from 'path'
import { runNextCommand, findAllTelemetryEvents } from 'next-test-utils'
import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('Telemetry CLI', () => {
  if (isNextStart) {
    it('can print telemetry status', async () => {
      const { stdout } = await runNextCommand(['telemetry'], {
        stdout: true,
      })
      expect(stdout).toMatch(/Status: .*/)
    })

    it('can enable telemetry with flag', async () => {
      const { stdout } = await runNextCommand(['telemetry', '--enable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/Success/)
      expect(stdout).toMatch(/Status: Enabled/)
    })

    it('can disable telemetry with flag', async () => {
      const { stdout } = await runNextCommand(['telemetry', '--disable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/Your preference has been saved/)
      expect(stdout).toMatch(/Status: Disabled/)
    })

    it('can enable telemetry without flag', async () => {
      const { stdout } = await runNextCommand(['telemetry', 'enable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/Success/)
      expect(stdout).toMatch(/Status: Enabled/)
    })

    it('can re-enable telemetry', async () => {
      const { stdout } = await runNextCommand(['telemetry', 'enable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/Success/)
      expect(stdout).toMatch(/Status: Enabled/)
    })

    it('can disable telemetry without flag', async () => {
      const { stdout } = await runNextCommand(['telemetry', 'disable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/Your preference has been saved/)
      expect(stdout).toMatch(/Status: Disabled/)
    })

    it('can re-disable telemetry', async () => {
      const { stdout } = await runNextCommand(['telemetry', 'disable'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '',
        },
      })
      expect(stdout).toMatch(/already disabled/)
      expect(stdout).toMatch(/Status: Disabled/)
    })

    it('can disable telemetry with env NEXT_TELEMETRY_DISABLED', async () => {
      // next config is not reset between tests
      await runNextCommand(['telemetry', 'enable'])
      const { stdout } = await runNextCommand(['telemetry', 'status'], {
        stdout: true,
        env: {
          NEXT_TELEMETRY_DISABLED: '1',
        },
      })
      expect(stdout).toMatch(/Status: Disabled/)
    })

    describe('when swc fails to load', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          // block swc from loading
          NODE_OPTIONS: '--no-addons',
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        const { cliOutput } = await next.build()
        expect(cliOutput).toContain('NEXT_SWC_LOAD_FAILURE')
        expect(cliOutput).toContain(
          `"nextVersion": "${require('next/package.json').version}"`
        )
        expect(cliOutput).toContain(`"arch": "${process.arch}"`)
        expect(cliOutput).toContain(`"platform": "${process.platform}"`)
        expect(cliOutput).toContain(`"nodeVersion": "${process.versions.node}"`)
      })
    })

    describe('with warnings', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile(
          path.join('pages', 'warning.skip'),
          path.join('pages', 'warning.js')
        )
        const { cliOutput } = await next.build()

        // Turbopack does not have this specific log line.
        if (!process.env.IS_TURBOPACK_TEST) {
          expect(cliOutput).toMatch(/Compiled with warnings/)
        }
        expect(cliOutput).toMatch(/NEXT_BUILD_COMPLETED/)
      })
    })

    describe('with tests', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile(
          path.join('pages', 'hello.test.skip'),
          path.join('pages', 'hello.test.js')
        )
        const { cliOutput } = await next.build()

        const event1 = /NEXT_BUILD_COMPLETED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()
        expect(event1).toMatch(/hasDunderPages.*?true/)
        expect(event1).toMatch(/hasTestPages.*?true/)

        const event2 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()
        expect(event2).toMatch(/hasDunderPages.*?true/)
        expect(event2).toMatch(/hasTestPages.*?true/)
      })
    })

    describe('basic', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('detects correct cli session defaults', async () => {
        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(next.cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('detect static 404 correctly for `next build`', async () => {
        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(next.cliOutput)
          .pop()
        expect(event1).toMatch(/hasStatic404.*?true/)
      })

      it('detect page counts correctly for `next build`', async () => {
        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(next.cliOutput)
          .pop()
        expect(event1).toMatch(/"staticPropsPageCount": 2/)
        expect(event1).toMatch(/"serverPropsPageCount": 2/)
        expect(event1).toMatch(/"ssrPageCount": 3/)
        expect(event1).toMatch(/"staticPageCount": 5/)
        expect(event1).toMatch(/"totalPageCount": 12/)
        expect(event1).toMatch(/"totalAppPagesCount": 3/)
        expect(event1).toMatch(/"staticAppPagesCount": 3/)
        expect(event1).toMatch(/"serverAppPagesCount": 0/)
        expect(event1).toMatch(/"edgeRuntimeAppCount": 0/)
        expect(event1).toMatch(/"edgeRuntimePagesCount": 2/)
      })
    })

    describe('cli session: babel tooling config', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile('.babelrc.default', '.babelrc')
        const { cliOutput } = await next.build()

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    describe('cli session: custom babel config (plugin)', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile('.babelrc.plugin', '.babelrc')
        const { cliOutput } = await next.build()

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    describe('cli session: package.json custom babel config (plugin)', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile('package.babel', 'package.json')
        const { cliOutput } = await next.build()

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    describe('cli session: custom babel config (preset)', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile('.babelrc.preset', '.babelrc')
        const { cliOutput } = await next.build()

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    describe('cli session: next config with webpack', () => {
      let { next } = nextTestSetup({
        files: path.join(__dirname, '..'),
        skipStart: true,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      it('emits event', async () => {
        await next.renameFile('next.config.webpack', 'next.config.js')
        const { cliOutput } = await next.build()

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": true/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": true/)
        expect(event).toMatch(/"hasBabelConfig": false/)

        // This event doesn't get recorded for Turbopack as the webpack config is not executed.
        if (!process.env.IS_TURBOPACK_TEST) {
          // Check if features are detected correctly when custom webpack config exists
          const featureUsageEvents = findAllTelemetryEvents(
            cliOutput,
            'NEXT_BUILD_FEATURE_USAGE'
          )
          expect(featureUsageEvents).toContainEqual({
            featureName: 'swcStyledComponents',
            invocationCount: 0,
          })

          expect(featureUsageEvents).toContainEqual({
            featureName: 'webpackPlugins',
            invocationCount: 1,
          })
        }
      })
    })
  } else {
    it('skipped', () => {})
  }
})
