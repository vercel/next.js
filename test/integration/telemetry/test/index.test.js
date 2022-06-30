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
  nextLint,
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
    // must clear cache for GSSP imports to be detected correctly
    await fs.remove(path.join(appDir, '.next'))
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/isSrcDir.*?false/)
    expect(stderr).toMatch(/package.*?"fs"/)
    expect(stderr).toMatch(/package.*?"path"/)
    expect(stderr).toMatch(/package.*?"http"/)
    expect(stderr).toMatch(/NEXT_PACKAGE_USED_IN_GET_SERVER_SIDE_PROPS/)

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
    expect(event1).toMatch(/"serverPropsPageCount": 2/)
    expect(event1).toMatch(/"ssrPageCount": 1/)
    expect(event1).toMatch(/"staticPageCount": 4/)
    expect(event1).toMatch(/"totalPageCount": 9/)
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
    await fs.utimes(
      path.join(appDir, 'pages', '_app_withreportwebvitals.empty'),
      new Date(),
      new Date()
    )
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
    await fs.utimes(
      path.join(appDir, 'pages', '_app_withoutreportwebvitals.empty'),
      new Date(),
      new Date()
    )
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
    expect(event1).toMatch(/"middlewareCount": 0/)
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
    expect(event1).toMatch(/"imageEnabled": true/)
    expect(event1).toMatch(/"imageFutureEnabled": false/)
    expect(event1).toMatch(/"imageDomainsCount": 2/)
    expect(event1).toMatch(/"imageRemotePatternsCount": 1/)
    expect(event1).toMatch(/"imageSizes": "64,128,256,512,1024"/)
    expect(event1).toMatch(/"imageFormats": "image\/avif,image\/webp"/)
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
    expect(event2).toMatch(/"imageDomainsCount": 2/)
    expect(event2).toMatch(/"imageRemotePatternsCount": 1/)
    expect(event2).toMatch(/"imageSizes": "64,128,256,512,1024"/)
    expect(event2).toMatch(/"trailingSlashEnabled": false/)
    expect(event2).toMatch(/"reactStrictMode": false/)
  })

  it('emits telemetry for lint during build', async () => {
    await fs.writeFile(
      path.join(appDir, '.eslintrc'),
      `{ "root": true, "extends": "next" }`
    )
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })
    await fs.remove(path.join(appDir, '.eslintrc'))

    const event1 = /NEXT_LINT_CHECK_COMPLETED[\s\S]+?{([\s\S}]+?)^}/m
      .exec(stderr)
      .pop()

    expect(event1).toMatch(/"durationInSeconds": [\d]{1,}/)
    expect(event1).toMatch(/"eslintVersion": ".*?\..*?\..*?"/)
    expect(event1).toMatch(/"lintedFilesCount": [\d]{1,}/)
    expect(event1).toMatch(/"lintFix": false/)
    expect(event1).toMatch(/"buildLint": true/)
    expect(event1).toMatch(/"nextEslintPluginVersion": ".*?\..*?\..*?"/)
    expect(event1).toMatch(/"nextEslintPluginErrorsCount": \d{1,}/)
    expect(event1).toMatch(/"nextEslintPluginWarningsCount": \d{1,}/)
    expect(event1).toMatch(`"nextRulesEnabled": {`)
    expect(event1).toMatch(/"@next\/next\/.+?": "(off|warn|error)"/)

    const event2 = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/
      .exec(stderr)
      .pop()
    expect(event2).toContain(`"featureName": "build-lint"`)
    expect(event2).toContain(`"invocationCount": 1`)
  })

  it(`emits telemetry for lint during build when '--no-lint' is specified`, async () => {
    const { stderr } = await nextBuild(appDir, ['--no-lint'], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    const event1 = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/
      .exec(stderr)
      .pop()

    expect(event1).toContain(`"featureName": "build-lint"`)
    expect(event1).toContain(`"invocationCount": 0`)
  })

  it(`emits telemetry for lint during build when 'ignoreDuringBuilds' is specified`, async () => {
    const nextConfig = path.join(appDir, 'next.config.js')
    await fs.writeFile(
      nextConfig,
      `module.exports = { eslint: { ignoreDuringBuilds: true } }`
    )
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })
    await fs.remove(nextConfig)

    const event1 = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/
      .exec(stderr)
      .pop()

    expect(event1).toContain(`"featureName": "build-lint"`)
    expect(event1).toContain(`"invocationCount": 0`)
  })

  it('emits telemetry for `next lint`', async () => {
    await fs.writeFile(
      path.join(appDir, '.eslintrc'),
      `{ "root": true, "extends": "next" }`
    )
    const { stderr } = await nextLint(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })
    await fs.remove(path.join(appDir, '.eslintrc'))

    const event1 = /NEXT_LINT_CHECK_COMPLETED[\s\S]+?{([\s\S]+?)^}/m
      .exec(stderr)
      .pop()

    expect(event1).toMatch(/"durationInSeconds": [\d]{1,}/)
    expect(event1).toMatch(/"eslintVersion": ".*?\..*?\..*?"/)
    expect(event1).toMatch(/"lintedFilesCount": [\d]{1,}/)
    expect(event1).toMatch(/"lintFix": false/)
    expect(event1).toMatch(/"buildLint": false/)
    expect(event1).toMatch(/"nextEslintPluginVersion": ".*?\..*?\..*?"/)
    expect(event1).toMatch(/"nextEslintPluginErrorsCount": \d{1,}/)
    expect(event1).toMatch(/"nextEslintPluginWarningsCount": \d{1,}/)
    expect(event1).toMatch(`"nextRulesEnabled": {`)
    expect(event1).toMatch(/"@next\/next\/.+?": "(off|warn|error)"/)
  })

  it('emits telemery for usage of image, script & dynamic', async () => {
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })
    const regex = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/g
    regex.exec(stderr).pop() // optimizeCss
    regex.exec(stderr).pop() // nextScriptWorkers
    regex.exec(stderr).pop() // build-lint
    const optimizeFonts = regex.exec(stderr).pop()
    expect(optimizeFonts).toContain(`"featureName": "optimizeFonts"`)
    expect(optimizeFonts).toContain(`"invocationCount": 1`)
    regex.exec(stderr).pop() // swcLoader
    regex.exec(stderr).pop() // swcMinify
    regex.exec(stderr).pop() // swcRelay
    regex.exec(stderr).pop() // swcStyledComponents
    regex.exec(stderr).pop() // swcExperimentalDecorators
    regex.exec(stderr).pop() // swcReactRemoveProperties
    regex.exec(stderr).pop() // swcRemoveConsole
    regex.exec(stderr).pop() // swcImportSource
    regex.exec(stderr).pop() // swcEmotion
    regex.exec(stderr).pop() // swc/targets/*
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    regex.exec(stderr).pop()
    const image = regex.exec(stderr).pop()
    expect(image).toContain(`"featureName": "next/image"`)
    expect(image).toContain(`"invocationCount": 1`)
    const script = regex.exec(stderr).pop()
    expect(script).toContain(`"featureName": "next/script"`)
    expect(script).toContain(`"invocationCount": 1`)
    const dynamic = regex.exec(stderr).pop()
    expect(dynamic).toContain(`"featureName": "next/dynamic"`)
    expect(dynamic).toContain(`"invocationCount": 1`)
  })

  it('emits telemetry for usage of swc', async () => {
    await fs.remove(path.join(appDir, 'next.config.js'))
    await fs.remove(path.join(appDir, 'jsconfig.json'))
    await fs.rename(
      path.join(appDir, 'next.config.swc'),
      path.join(appDir, 'next.config.js')
    )
    await fs.rename(
      path.join(appDir, 'jsconfig.swc'),
      path.join(appDir, 'jsconfig.json')
    )
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })
    await fs.remove(path.join(appDir, 'next.config.js'))
    await fs.remove(path.join(appDir, 'jsconfig.json'))

    const regex = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/g
    regex.exec(stderr).pop() // optimizeCss
    regex.exec(stderr).pop() // nextScriptWorkers
    regex.exec(stderr).pop() // build-lint
    regex.exec(stderr).pop() // optimizeFonts
    const swcLoader = regex.exec(stderr).pop()
    expect(swcLoader).toContain(`"featureName": "swcLoader"`)
    expect(swcLoader).toContain(`"invocationCount": 1`)
    const swcMinify = regex.exec(stderr).pop()
    expect(swcMinify).toContain(`"featureName": "swcMinify"`)
    expect(swcMinify).toContain(`"invocationCount": 1`)
    const swcRelay = regex.exec(stderr).pop()
    expect(swcRelay).toContain(`"featureName": "swcRelay"`)
    expect(swcRelay).toContain(`"invocationCount": 1`)
    const swcStyledComponents = regex.exec(stderr).pop()
    expect(swcStyledComponents).toContain(
      `"featureName": "swcStyledComponents"`
    )
    expect(swcStyledComponents).toContain(`"invocationCount": 1`)
    const swcReactRemoveProperties = regex.exec(stderr).pop()
    expect(swcReactRemoveProperties).toContain(
      `"featureName": "swcReactRemoveProperties"`
    )
    expect(swcReactRemoveProperties).toContain(`"invocationCount": 1`)
    const swcExperimentalDecorators = regex.exec(stderr).pop()
    expect(swcExperimentalDecorators).toContain(
      `"featureName": "swcExperimentalDecorators"`
    )
    expect(swcExperimentalDecorators).toContain(`"invocationCount": 1`)
    const swcRemoveConsole = regex.exec(stderr).pop()
    expect(swcRemoveConsole).toContain(`"featureName": "swcRemoveConsole"`)
    expect(swcRemoveConsole).toContain(`"invocationCount": 1`)
    const swcImportSource = regex.exec(stderr).pop()
    expect(swcImportSource).toContain(`"featureName": "swcImportSource"`)
    expect(swcImportSource).toContain(`"invocationCount": 0`)
  })

  it('emits telemetry for usage of `optimizeCss`', async () => {
    await fs.rename(
      path.join(appDir, 'next.config.optimize-css'),
      path.join(appDir, 'next.config.js')
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.optimize-css')
    )

    const regex = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/g
    regex.exec(stderr).pop() // build-lint
    const optimizeCss = regex.exec(stderr).pop()
    expect(optimizeCss).toContain(`"featureName": "experimental/optimizeCss"`)
    expect(optimizeCss).toContain(`"invocationCount": 1`)
  })

  it('emits telemetry for usage of `nextScriptWorkers`', async () => {
    await fs.rename(
      path.join(appDir, 'next.config.next-script-workers'),
      path.join(appDir, 'next.config.js')
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.next-script-workers')
    )

    const regex = /NEXT_BUILD_FEATURE_USAGE[\s\S]+?{([\s\S]+?)}/g
    regex.exec(stderr).pop() // build-lint
    regex.exec(stderr).pop() // optimizeCss
    const nextScriptWorkers = regex.exec(stderr).pop()
    expect(nextScriptWorkers).toContain(
      `"featureName": "experimental/nextScriptWorkers"`
    )
    expect(nextScriptWorkers).toContain(`"invocationCount": 1`)
  })

  it('emits telemetry for usage of middleware', async () => {
    await fs.writeFile(
      path.join(appDir, 'middleware.js'),
      `export function middleware () { }`
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    await fs.remove(path.join(appDir, 'middleware.js'))

    const regex = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
    const optimizedEvt = regex.exec(stderr).pop()
    expect(optimizedEvt).toContain(`"middlewareCount": 1`)
  })

  it('emits telemetry for usage of swc plugins', async () => {
    await fs.remove(path.join(appDir, 'next.config.js'))
    await fs.remove(path.join(appDir, 'package.json'))

    await fs.rename(
      path.join(appDir, 'next.config.swc-plugins'),
      path.join(appDir, 'next.config.js')
    )

    await fs.rename(
      path.join(appDir, 'package.swc-plugins'),
      path.join(appDir, 'package.json')
    )

    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
      env: { NEXT_TELEMETRY_DEBUG: 1 },
    })

    console.log(stderr)

    await fs.rename(
      path.join(appDir, 'next.config.js'),
      path.join(appDir, 'next.config.swc-plugins')
    )

    await fs.rename(
      path.join(appDir, 'package.json'),
      path.join(appDir, 'package.swc-plugins')
    )

    const regex = /NEXT_SWC_PLUGIN_DETECTED[\s\S]+?{([\s\S]+?)}/g

    const coverage = regex.exec(stderr).pop()
    expect(coverage).toContain(
      `"packageName": "swc-plugin-coverage-instrument"`
    )
    expect(coverage).toContain(`"packageVersion": "0.0.6"`)

    const relay = regex.exec(stderr).pop()
    expect(relay).toContain(`"packageName": "@swc/plugin-relay"`)
    expect(relay).toContain(`"packageVersion": "0.2.0"`)

    const absolute = regex.exec(stderr).pop()
    expect(absolute).toContain(
      `"packageName": "/test/absolute_path/plugin.wasm"`
    )
    expect(absolute).not.toContain(`packageVersion`)
  })
})
