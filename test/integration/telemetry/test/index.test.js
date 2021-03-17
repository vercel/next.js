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

    const handleStderr = (msg) => {
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

  it('detect reportWebVitals correctly for `next build`', async () => {
    // Case 1: When _app.js does not exist.
    let build = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    let event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
      .exec(build.stderr)
      .pop()
    expect(event1).toMatch(/hasReportWebVitals.*?false/)

    // Case 2: When _app.js exist with reportWebVitals function.
    await fs.rename(
      path.join(appDir, 'pages', '_app_withreportwebvitals.empty'),
      path.join(appDir, 'pages', '_app.js')
    )

    build = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'pages', '_app.js'),
      path.join(appDir, 'pages', '_app_withreportwebvitals.empty')
    )

    event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(build.stderr).pop()
    expect(event1).toMatch(/hasReportWebVitals.*?true/)

    // Case 3: When _app.js exist without reportWebVitals function.
    await fs.rename(
      path.join(appDir, 'pages', '_app_withoutreportwebvitals.empty'),
      path.join(appDir, 'pages', '_app.js')
    )

    build = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'pages', '_app.js'),
      path.join(appDir, 'pages', '_app_withoutreportwebvitals.empty')
    )

    event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(build.stderr).pop()
    expect(event1).toMatch(/hasReportWebVitals.*?false/)
  })

  it('detects rewrites, headers, and redirects for next build', async () => {
    await fs.rename(
      path.join(appDir, 'next.config.custom-routes'),
      path.join(appDir, 'next.config.js')
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.custom-routes')
    )

    const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/.exec(stderr).pop()
    expect(event1).toMatch(/"headersCount": 1/)
    expect(event1).toMatch(/"rewritesCount": 2/)
    expect(event1).toMatch(/"redirectsCount": 1/)
  })

  it('detects i18n and image configs for session start', async () => {
    await fs.rename(
      path.join(appDir, 'next.config.i18n-images'),
      path.join(appDir, 'next.config.js')
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.i18n-images')
    )

    const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
      .exec(stderr)
      .pop()

    expect(event1).toMatch(/"i18nEnabled": true/)
    expect(event1).toMatch(/"locales": "en,nl,fr"/)
    expect(event1).toMatch(/"localeDomainsCount": 2/)
    expect(event1).toMatch(/"localeDetectionEnabled": true/)
    expect(event1).toMatch(/"imageDomainsCount": 1/)
    expect(event1).toMatch(/"imageSizes": "64,128,256,512,1024"/)
    expect(event1).toMatch(/"trailingSlashEnabled": false/)
    expect(event1).toMatch(/"reactStrictMode": false/)

    await fs.rename(
      path.join(appDir, 'next.config.i18n-images'),
      path.join(appDir, 'next.config.js')
    )

    let stderr2 = ''

    let app = await launchApp(appDir, await findPort(), {
      onStderr(msg) {
        stderr2 += msg || ''
      },
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.i18n-images')
    )

    const event2 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
      .exec(stderr2)
      .pop()
    expect(event2).toMatch(/"i18nEnabled": true/)
    expect(event2).toMatch(/"locales": "en,nl,fr"/)
    expect(event2).toMatch(/"localeDomainsCount": 2/)
    expect(event2).toMatch(/"localeDetectionEnabled": true/)
    expect(event2).toMatch(/"imageDomainsCount": 1/)
    expect(event2).toMatch(/"imageSizes": "64,128,256,512,1024"/)
    expect(event2).toMatch(/"trailingSlashEnabled": false/)
    expect(event2).toMatch(/"reactStrictMode": false/)
  })
})
