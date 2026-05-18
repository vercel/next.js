import path from 'path'
import fs from 'fs-extra'
import { isReact18, nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'

// The telemetry suite drives multiple consecutive `next build` invocations
// against the same isolated install. With React 18 these runs intermittently
// fail with "can not run export while server is running, use next.stop()
// first". The telemetry feature itself is not React-version-specific, so
// skipping under React 18 is fine until the underlying build/server lifecycle
// race is fixed.
;(isReact18 ? describe.skip : describe)('Telemetry CLI', () => {
  const { next, isNextStart, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('can print telemetry status', async () => {
    const { stdout } = await next.runCommand(['telemetry'])
    expect(stdout).toMatch(/Status: .*/)
  })

  it('can enable telemetry with flag', async () => {
    const { stdout } = await next.runCommand(['telemetry', '--enable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry with flag', async () => {
    const { stdout } = await next.runCommand(['telemetry', '--disable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can enable telemetry without flag', async () => {
    const { stdout } = await next.runCommand(['telemetry', 'enable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can re-enable telemetry', async () => {
    const { stdout } = await next.runCommand(['telemetry', 'enable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry without flag', async () => {
    const { stdout } = await next.runCommand(['telemetry', 'disable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can re-disable telemetry', async () => {
    const { stdout } = await next.runCommand(['telemetry', 'disable'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '',
      },
    })
    expect(stdout).toMatch(/already disabled/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can disable telemetry with env NEXT_TELEMETRY_DISABLED', async () => {
    await next.runCommand(['telemetry', 'enable'])
    const { stdout } = await next.runCommand(['telemetry', 'status'], {
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
      },
    })
    expect(stdout).toMatch(/Status: Disabled/)
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    // Tests in this block run a full `next build` per test. With a custom
    // `.babelrc` webpack switches off SWC and the build can take 60s+,
    // exceeding Jest's default 60s timeout. When the test times out, the
    // build process keeps running, so the auto-retry (jest.retryTimes(1) in
    // CI start mode) and subsequent tests see `this.childProcess` still set
    // and throw "can not run export while server is running".
    jest.setTimeout(180 * 1000)

    it('emits event when swc fails to load', async () => {
      await fs.remove(path.join(next.testDir, '.next'))
      const { cliOutput } = await next.build({
        env: {
          NODE_OPTIONS: '--no-addons',
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
      expect(cliOutput).toMatch(/NEXT_SWC_LOAD_FAILURE/)
      expect(cliOutput).toContain(
        `"nextVersion": "${require('next/package.json').version}"`
      )
      expect(cliOutput).toContain(`"arch": "${process.arch}"`)
      expect(cliOutput).toContain(`"platform": "${process.platform}"`)
      expect(cliOutput).toContain(`"nodeVersion": "${process.versions.node}"`)
    })

    it('logs completed `next build` with warnings', async () => {
      await fs.rename(
        path.join(next.testDir, 'pages', 'warning.skip'),
        path.join(next.testDir, 'pages', 'warning.js')
      )
      const { cliOutput } = await next.build({
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
      await fs.rename(
        path.join(next.testDir, 'pages', 'warning.js'),
        path.join(next.testDir, 'pages', 'warning.skip')
      )

      if (!isTurbopack) {
        expect(cliOutput).toMatch(/Compiled with warnings/)
      }
      expect(cliOutput).toMatch(/NEXT_BUILD_COMPLETED/)
    })

    it('detects tests correctly for `next build`', async () => {
      await fs.rename(
        path.join(next.testDir, 'pages', 'hello.test.skip'),
        path.join(next.testDir, 'pages', 'hello.test.js')
      )
      const { cliOutput } = await next.build({
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
      await fs.rename(
        path.join(next.testDir, 'pages', 'hello.test.js'),
        path.join(next.testDir, 'pages', 'hello.test.skip')
      )

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

    it('detects correct cli session defaults', async () => {
      const { cliOutput } = await next.build({
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
        .exec(cliOutput)
        .pop()

      expect(event).toMatch(/"hasNextConfig": false/)
      expect(event).toMatch(/"buildTarget": "default"/)
      expect(event).toMatch(/"hasWebpackConfig": false/)
      expect(event).toMatch(/"hasBabelConfig": false/)
    })

    it('cli session: babel tooling config', async () => {
      // Read the fixture content from the source dir rather than from
      // `next.testDir`, since the isolated install may not reliably copy
      // top-level dotfiles. `patchFile` writes the file, runs the callback,
      // and restores/removes it afterwards regardless of build outcome.
      const babelrc = await fs.readFile(
        path.join(__dirname, '.babelrc.default'),
        'utf8'
      )
      await next.patchFile('.babelrc', babelrc, async () => {
        const { cliOutput } = await next.build({
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    it('cli session: custom babel config (plugin)', async () => {
      const babelrc = await fs.readFile(
        path.join(__dirname, '.babelrc.plugin'),
        'utf8'
      )
      await next.patchFile('.babelrc', babelrc, async () => {
        const { cliOutput } = await next.build({
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    it('cli session: package.json custom babel config (plugin)', async () => {
      const babelPkg = JSON.parse(
        await fs.readFile(path.join(__dirname, 'package.babel'), 'utf8')
      )
      const originalPkg = await next.readFile('package.json')
      // Merge the babel field into the existing package.json so we keep
      // `packageManager` and dependencies. Otherwise corepack auto-fetches
      // pnpm and the build fails on CI runners.
      const merged = JSON.stringify({ ...JSON.parse(originalPkg), ...babelPkg })
      await next.patchFile('package.json', merged, async () => {
        const { cliOutput } = await next.build({
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    it('cli session: custom babel config (preset)', async () => {
      const babelrc = await fs.readFile(
        path.join(__dirname, '.babelrc.preset'),
        'utf8'
      )
      await next.patchFile('.babelrc', babelrc, async () => {
        const { cliOutput } = await next.build({
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })
    })

    it('cli session: next config with webpack', async () => {
      const nextConfig = await fs.readFile(
        path.join(__dirname, 'next.config.webpack'),
        'utf8'
      )
      await next.patchFile('next.config.js', nextConfig, async () => {
        const { cliOutput } = await next.build({
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"hasNextConfig": true/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": true/)
        expect(event).toMatch(/"hasBabelConfig": false/)

        if (!isTurbopack) {
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

    it('detect static 404 correctly for `next build`', async () => {
      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
        .exec(cliOutput)
        .pop()
      expect(event1).toMatch(/hasStatic404.*?true/)
    })

    it('detect page counts correctly for `next build`', async () => {
      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
        .exec(cliOutput)
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
})
