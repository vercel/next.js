import path from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import { runNextCommand, findAllTelemetryEvents } from 'next-test-utils'

describe('Telemetry CLI', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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
    await runNextCommand(['telemetry', 'enable'])
    const { stdout } = await runNextCommand(['telemetry', 'status'], {
      stdout: true,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
      },
    })
    expect(stdout).toMatch(/Status: Disabled/)
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('emits event when swc fails to load', async () => {
        await fs.remove(path.join(next.testDir, '.next'))
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NODE_OPTIONS: '--no-addons',
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        expect(stderr).toMatch(/NEXT_SWC_LOAD_FAILURE/)
        expect(stderr).toContain(
          `"nextVersion": "${require('next/package.json').version}"`
        )
        expect(stderr).toContain(`"arch": "${process.arch}"`)
        expect(stderr).toContain(`"platform": "${process.platform}"`)
        expect(stderr).toContain(`"nodeVersion": "${process.versions.node}"`)
      })

      it('logs completed `next build` with warnings', async () => {
        await fs.rename(
          path.join(next.testDir, 'pages', 'warning.skip'),
          path.join(next.testDir, 'pages', 'warning.js')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, 'pages', 'warning.js'),
          path.join(next.testDir, 'pages', 'warning.skip')
        )

        if (!process.env.IS_TURBOPACK_TEST) {
          expect(stderr).toMatch(/Compiled with warnings/)
        }
        expect(stderr).toMatch(/NEXT_BUILD_COMPLETED/)
      })

      it('detects tests correctly for `next build`', async () => {
        await fs.rename(
          path.join(next.testDir, 'pages', 'hello.test.skip'),
          path.join(next.testDir, 'pages', 'hello.test.js')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, 'pages', 'hello.test.js'),
          path.join(next.testDir, 'pages', 'hello.test.skip')
        )

        const event1 = /NEXT_BUILD_COMPLETED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()
        expect(event1).toMatch(/hasDunderPages.*?true/)
        expect(event1).toMatch(/hasTestPages.*?true/)

        const event2 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()
        expect(event2).toMatch(/hasDunderPages.*?true/)
        expect(event2).toMatch(/hasTestPages.*?true/)
      })

      it('detects correct cli session defaults', async () => {
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('cli session: babel tooling config', async () => {
        await fs.rename(
          path.join(next.testDir, '.babelrc.default'),
          path.join(next.testDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, '.babelrc'),
          path.join(next.testDir, '.babelrc.default')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('cli session: custom babel config (plugin)', async () => {
        await fs.rename(
          path.join(next.testDir, '.babelrc.plugin'),
          path.join(next.testDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, '.babelrc'),
          path.join(next.testDir, '.babelrc.plugin')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('cli session: package.json custom babel config (plugin)', async () => {
        await fs.rename(
          path.join(next.testDir, 'package.babel'),
          path.join(next.testDir, 'package.json')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, 'package.json'),
          path.join(next.testDir, 'package.babel')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('cli session: custom babel config (preset)', async () => {
        await fs.rename(
          path.join(next.testDir, '.babelrc.preset'),
          path.join(next.testDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, '.babelrc'),
          path.join(next.testDir, '.babelrc.preset')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": false/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": false/)
        expect(event).toMatch(/"hasBabelConfig": false/)
      })

      it('cli session: next config with webpack', async () => {
        await fs.rename(
          path.join(next.testDir, 'next.config.webpack'),
          path.join(next.testDir, 'next.config.js')
        )
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: '1',
          },
        })
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.webpack')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": true/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": true/)
        expect(event).toMatch(/"hasBabelConfig": false/)

        if (!process.env.IS_TURBOPACK_TEST) {
          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
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

      it('detect static 404 correctly for `next build`', async () => {
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()
        expect(event1).toMatch(/hasStatic404.*?true/)
      })

      it('detect page counts correctly for `next build`', async () => {
        const { stderr } = await runNextCommand(['build', next.testDir], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
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
    }
  )
})
