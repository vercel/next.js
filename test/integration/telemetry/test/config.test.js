import {
  check,
  findAllTelemetryEvents,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextLint,
} from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

const appDir = path.join(__dirname, '..')

describe('config telemetry', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
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

      try {
        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()
        expect(event1).toMatch(/"headersCount": 1/)
        expect(event1).toMatch(/"rewritesCount": 2/)
        expect(event1).toMatch(/"redirectsCount": 1/)
        expect(event1).toMatch(/"middlewareCount": 0/)
      } catch (err) {
        require('console').error('failing stderr', stderr, err)
        throw err
      }
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

      try {
        const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event1).toMatch(/"i18nEnabled": true/)
        expect(event1).toMatch(/"locales": "en,nl,fr"/)
        expect(event1).toMatch(/"localeDomainsCount": 2/)
        expect(event1).toMatch(/"localeDetectionEnabled": true/)
        expect(event1).toMatch(/"imageEnabled": true/)
        expect(event1).toMatch(/"imageFutureEnabled": true/)
        expect(event1).toMatch(/"imageDomainsCount": 2/)
        expect(event1).toMatch(/"imageRemotePatternsCount": 1/)
        expect(event1).toMatch(/"imageSizes": "64,128,256,512,1024"/)
        expect(event1).toMatch(/"imageFormats": "image\/avif,image\/webp"/)
        expect(event1).toMatch(/"nextConfigOutput": null/)
        expect(event1).toMatch(/"trailingSlashEnabled": false/)
        expect(event1).toMatch(/"reactStrictMode": false/)
        expect(event1).toMatch(/"turboFlag": false/)
        expect(event1).toMatch(/"pagesDir": true/)
        expect(event1).toMatch(/"appDir": false/)
      } catch (err) {
        require('console').error('failing stderr', stderr, err)
        throw err
      }

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
      await check(() => stderr2, /NEXT_CLI_SESSION_STARTED/)
      await killApp(app)

      await fs.rename(
        path.join(appDir, 'next.config.js'),
        path.join(appDir, 'next.config.i18n-images')
      )

      try {
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
        expect(event2).toMatch(/"nextConfigOutput": null/)
        expect(event2).toMatch(/"trailingSlashEnabled": false/)
        expect(event2).toMatch(/"reactStrictMode": false/)
      } catch (err) {
        require('console').error(stderr2)
        throw err
      }
    })

    it('detects output config for session start', async () => {
      await fs.writeFile(
        './next.config.js',
        'module.exports = { output: "export" }'
      )
      try {
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: 1 },
        })

        try {
          const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
            .exec(stderr)
            .pop()

          expect(event1).toContain('"nextConfigOutput": "export"')
        } catch (err) {
          require('console').error('failing stderr', stderr, err)
          throw err
        }
      } finally {
        await fs.remove('./next.config.js')
      }
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

      try {
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

        const featureUsageEvents = findAllTelemetryEvents(
          stderr,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(featureUsageEvents).toContainEqual({
          featureName: 'build-lint',
          invocationCount: 1,
        })
      } catch (err) {
        require('console').error('failing stderr', stderr, err)
        throw err
      }
    })

    it(`emits telemetry for lint during build when '--no-lint' is specified`, async () => {
      const { stderr } = await nextBuild(appDir, ['--no-lint'], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })
      const events = findAllTelemetryEvents(stderr, 'NEXT_BUILD_FEATURE_USAGE')
      expect(events).toContainEqual({
        featureName: 'build-lint',
        invocationCount: 0,
      })
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

      const events = findAllTelemetryEvents(stderr, 'NEXT_BUILD_FEATURE_USAGE')
      expect(events).toContainEqual({
        featureName: 'build-lint',
        invocationCount: 0,
      })
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

    it('emits telemery for usage of optimizeFonts, image, script & dynamic', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })
      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )

      expect(featureUsageEvents).toEqual(
        expect.arrayContaining([
          {
            featureName: 'optimizeFonts',
            invocationCount: 1,
          },
          {
            featureName: 'next/image',
            invocationCount: 2,
          },
          {
            featureName: 'next/script',
            invocationCount: 1,
          },
          {
            featureName: 'next/dynamic',
            invocationCount: 1,
          },
        ])
      )
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
      await fs.rename(
        path.join(appDir, 'next.config.js'),
        path.join(appDir, 'next.config.swc')
      )
      await fs.rename(
        path.join(appDir, 'jsconfig.json'),
        path.join(appDir, 'jsconfig.swc')
      )
      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toEqual(
        expect.arrayContaining([
          {
            featureName: 'swcLoader',
            invocationCount: 1,
          },
          {
            featureName: 'swcMinify',
            invocationCount: 1,
          },
          {
            featureName: 'swcRelay',
            invocationCount: 1,
          },
          {
            featureName: 'swcStyledComponents',
            invocationCount: 1,
          },
          {
            featureName: 'swcReactRemoveProperties',
            invocationCount: 1,
          },
          {
            featureName: 'swcExperimentalDecorators',
            invocationCount: 1,
          },
          {
            featureName: 'swcRemoveConsole',
            invocationCount: 1,
          },
          {
            featureName: 'swcImportSource',
            invocationCount: 0,
          },
        ])
      )
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

      const events = findAllTelemetryEvents(stderr, 'NEXT_BUILD_FEATURE_USAGE')
      expect(events).toContainEqual({
        featureName: 'experimental/optimizeCss',
        invocationCount: 1,
      })
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

      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'experimental/nextScriptWorkers',
        invocationCount: 1,
      })
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

      const buildOptimizedEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_OPTIMIZED'
      )
      expect(buildOptimizedEvents).toContainEqual(
        expect.objectContaining({
          middlewareCount: 1,
        })
      )
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

      await fs.rename(
        path.join(appDir, 'next.config.js'),
        path.join(appDir, 'next.config.swc-plugins')
      )

      await fs.rename(
        path.join(appDir, 'package.json'),
        path.join(appDir, 'package.swc-plugins')
      )

      const pluginDetectedEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_SWC_PLUGIN_DETECTED'
      )
      expect(pluginDetectedEvents).toEqual([
        {
          pluginName: 'swc-plugin-coverage-instrument',
          pluginVersion: '0.0.6',
        },
        {
          pluginName: '@swc/plugin-relay',
          pluginVersion: '0.2.0',
        },
        {
          pluginName: '/test/absolute_path/plugin.wasm',
        },
      ])
    })

    it('emits telemetry for usage of next/legacy/image', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })
      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'next/legacy/image',
        invocationCount: 2,
      })
      expect(featureUsageEvents).toContainEqual({
        featureName: 'next/image',
        invocationCount: 2,
      })
    })

    it('emits telemetry for usage of @vercel/og', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })
      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'vercelImageGeneration',
        invocationCount: 1,
      })
    })

    it('emits telemetry for transpilePackages', async () => {
      await fs.rename(
        path.join(appDir, 'next.config.transpile-packages'),
        path.join(appDir, 'next.config.js')
      )

      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })

      await fs.rename(
        path.join(appDir, 'next.config.js'),
        path.join(appDir, 'next.config.transpile-packages')
      )

      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'transpilePackages',
        invocationCount: 1,
      })
    })

    it('emits telemetry for middleware related options', async () => {
      await fs.rename(
        path.join(appDir, 'next.config.middleware-options'),
        path.join(appDir, 'next.config.js')
      )

      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
        env: { NEXT_TELEMETRY_DEBUG: 1 },
      })

      await fs.rename(
        path.join(appDir, 'next.config.js'),
        path.join(appDir, 'next.config.middleware-options')
      )

      const featureUsageEvents = findAllTelemetryEvents(
        stderr,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'skipMiddlewareUrlNormalize',
        invocationCount: 1,
      })
      expect(featureUsageEvents).toContainEqual({
        featureName: 'skipTrailingSlashRedirect',
        invocationCount: 1,
      })
    })
  })
})
