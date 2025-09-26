/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import {
  runNextCommand,
  nextBuild,
  findAllTelemetryEvents,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Telemetry CLI', () => {
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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('emits event when swc fails to load', async () => {
        await fs.remove(path.join(appDir, '.next'))
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            // block swc from loading
            NODE_OPTIONS: '--no-addons',
            NEXT_TELEMETRY_DEBUG: 1,
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
          path.join(appDir, 'pages', 'warning.skip'),
          path.join(appDir, 'pages', 'warning.js')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, 'pages', 'warning.js'),
          path.join(appDir, 'pages', 'warning.skip')
        )

        // Turbopack does not have this specific log line.
        if (!process.env.IS_TURBOPACK_TEST) {
          expect(stderr).toMatch(/Compiled with warnings/)
        }
        expect(stderr).toMatch(/NEXT_BUILD_COMPLETED/)
      })

      it('detects tests correctly for `next build`', async () => {
        await fs.rename(
          path.join(appDir, 'pages', 'hello.test.skip'),
          path.join(appDir, 'pages', 'hello.test.js')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, 'pages', 'hello.test.js'),
          path.join(appDir, 'pages', 'hello.test.skip')
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
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
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
          path.join(appDir, '.babelrc.default'),
          path.join(appDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, '.babelrc'),
          path.join(appDir, '.babelrc.default')
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
          path.join(appDir, '.babelrc.plugin'),
          path.join(appDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, '.babelrc'),
          path.join(appDir, '.babelrc.plugin')
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
          path.join(appDir, 'package.babel'),
          path.join(appDir, 'package.json')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, 'package.json'),
          path.join(appDir, 'package.babel')
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
          path.join(appDir, '.babelrc.preset'),
          path.join(appDir, '.babelrc')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, '.babelrc'),
          path.join(appDir, '.babelrc.preset')
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
          path.join(appDir, 'next.config.webpack'),
          path.join(appDir, 'next.config.js')
        )
        const { stderr } = await runNextCommand(['build', appDir], {
          stderr: true,
          env: {
            NEXT_TELEMETRY_DEBUG: 1,
          },
        })
        await fs.rename(
          path.join(appDir, 'next.config.js'),
          path.join(appDir, 'next.config.webpack')
        )

        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event).toMatch(/"hasNextConfig": true/)
        expect(event).toMatch(/"buildTarget": "default"/)
        expect(event).toMatch(/"hasWebpackConfig": true/)
        expect(event).toMatch(/"hasBabelConfig": false/)

        // This event doesn't get recorded for Turbopack as the webpack config is not executed.
        if (!process.env.IS_TURBOPACK_TEST) {
          // Check if features are detected correctly when custom webpack config exists
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
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: 1 },
        })

        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()
        expect(event1).toMatch(/hasStatic404.*?true/)
      })

      it('detect page counts correctly for `next build`', async () => {
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: 1 },
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
