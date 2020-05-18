/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import {
  runNextCommand,
  launchApp,
  findPort,
  killApp,
  waitFor,
  nextBuild,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

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
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry with flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can enable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can re-enable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can re-disable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/already disabled/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('detects isSrcDir dir correctly for `next build`', async () => {
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    const { stderr: stderr2 } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr2).toMatch(/isSrcDir.*?true/)
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

    expect(stderr).toMatch(/Compiled with warnings/)
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

    const event1 = /NEXT_BUILD_COMPLETED[\s\S]+?{([\s\S]+?)}/.exec(stderr).pop()
    expect(event1).toMatch(/hasDunderPages.*?true/)
    expect(event1).toMatch(/hasTestPages.*?true/)

    const event2 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(stderr).pop()
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
    expect(event).toMatch(/"hasBabelConfig": true/)
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
    expect(event).toMatch(/"hasBabelConfig": true/)
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
    expect(event).toMatch(/"hasBabelConfig": true/)
  })

  it('cli session: next config with target', async () => {
    await fs.rename(
      path.join(appDir, 'next.config.target'),
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
      path.join(appDir, 'next.config.target')
    )

    const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
      .exec(stderr)
      .pop()

    expect(event).toMatch(/"hasNextConfig": true/)
    expect(event).toMatch(/"buildTarget": "experimental-serverless-trace"/)
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
  })

  it('detect static 404 correctly for `next build`', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(stderr).pop()
    expect(event1).toMatch(/hasStatic404.*?true/)
  })

  it('detect page counts correctly for `next build`', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(stderr).pop()
    expect(event1).toMatch(/"staticPropsPageCount": 2/)
    expect(event1).toMatch(/"serverPropsPageCount": 1/)
    expect(event1).toMatch(/"ssrPageCount": 1/)
    expect(event1).toMatch(/"staticPageCount": 2/)
    expect(event1).toMatch(/"totalPageCount": 6/)
  })

  it('detects isSrcDir dir correctly for `next dev`', async () => {
    let port = await findPort()
    let stderr = ''

    const handleStderr = msg => {
      stderr += msg
    }
    let app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    stderr = ''

    port = await findPort()
    app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr).toMatch(/isSrcDir.*?true/)
  })
})
