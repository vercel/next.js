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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
          expect(event1).toMatch(/"imageLocalPatternsCount": 2/)
          expect(event1).toMatch(/"imageSizes": "64,128,256,512,1024"/)
          expect(event1).toMatch(/"imageQualities": "25,50,75"/)
          expect(event1).toMatch(/"imageFormats": "image\/avif,image\/webp"/)
          expect(event1).toMatch(/"nextConfigOutput": null/)
          expect(event1).toMatch(/"trailingSlashEnabled": false/)
          expect(event1).toMatch(/"reactStrictMode": false/)
          expect(event1).toMatch(/"turboFlag": false/)
          expect(event1).toMatch(/"pagesDir": true/)
          expect(event1).toMatch(/"appDir": true/)
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
          expect(event2).toMatch(/"imageLocalPatternsCount": 2/)
          expect(event2).toMatch(/"imageQualities": "25,50,75"/)
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
          path.join(appDir, 'next.config.js'),
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
          await fs.remove(path.join(appDir, 'next.config.js'))
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
          lint: true,
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
        const events = findAllTelemetryEvents(
          stderr,
          'NEXT_BUILD_FEATURE_USAGE'
        )
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
          lint: true,
        })
        await fs.remove(nextConfig)

        const events = findAllTelemetryEvents(
          stderr,
          'NEXT_BUILD_FEATURE_USAGE'
        )
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

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemery for usage of image, script & dynamic',
        async () => {
          const { stderr } = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
            lint: true,
          })
          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
            'NEXT_BUILD_FEATURE_USAGE'
          )

          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toEqual(
            expect.arrayContaining([
              {
                featureName: 'next/image',
                // FIXME: Should be +1 from App Router
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
        }
      )

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for usage of swc',
        async () => {
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
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toEqual(
            expect.arrayContaining([
              {
                featureName: 'swcLoader',
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
        }
      )

      it('emits telemetry for usage of `experimental/dynamicIO`', async () => {
        await fs.rename(
          path.join(appDir, 'next.config.dynamic-io'),
          path.join(appDir, 'next.config.js')
        )

        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: 1 },
        })

        await fs.rename(
          path.join(appDir, 'next.config.js'),
          path.join(appDir, 'next.config.dynamic-io')
        )

        const events = findAllTelemetryEvents(
          stderr,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(events).toContainEqual({
          featureName: 'experimental/dynamicIO',
          invocationCount: 1,
        })
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

        const events = findAllTelemetryEvents(
          stderr,
          'NEXT_BUILD_FEATURE_USAGE'
        )
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

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for usage of next/legacy/image',
        async () => {
          const { stderr } = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
            'NEXT_BUILD_FEATURE_USAGE'
          )
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            // FIXME: Should be +1 from App Router
            featureName: 'next/legacy/image',
            invocationCount: 2,
          })
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'next/image',
            // FIXME: Should be +1 from App Router
            invocationCount: 2,
          })
        }
      )

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for usage of @vercel/og',
        async () => {
          const { stderr } = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
            'NEXT_BUILD_FEATURE_USAGE'
          )
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'vercelImageGeneration',
            invocationCount: 1,
          })
        }
      )

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for transpilePackages',
        async () => {
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
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'transpilePackages',
            invocationCount: 1,
          })
        }
      )

      // Turbopack intentionally does not support these events
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for middleware related options',
        async () => {
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
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'skipMiddlewareUrlNormalize',
            invocationCount: 1,
          })
          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'skipTrailingSlashRedirect',
            invocationCount: 1,
          })
        }
      )

      it('emits telemetry for default React Compiler options', async () => {
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          env: { NEXT_TELEMETRY_DEBUG: 1 },
        })

        try {
          const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
            .exec(stderr)
            .pop()

          expect(event).toMatch(/"reactCompiler": false/)
          expect(event).toMatch(/"reactCompilerCompilationMode": null/)
          expect(event).toMatch(/"reactCompilerPanicThreshold": null/)
        } catch (err) {
          require('console').error('failing stderr', stderr, err)
          throw err
        }
      })

      it('emits telemetry for enabled React Compiler', async () => {
        await fs.rename(
          path.join(appDir, 'next.config.reactCompiler-base'),
          path.join(appDir, 'next.config.js')
        )

        let stderr
        try {
          const app = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          stderr = app.stderr
          const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
            .exec(stderr)
            .pop()

          expect(event).toMatch(/"reactCompiler": true/)
          expect(event).toMatch(/"reactCompilerCompilationMode": null/)
          expect(event).toMatch(/"reactCompilerPanicThreshold": null/)
        } catch (err) {
          require('console').error('failing stderr', stderr, err)
          throw err
        } finally {
          await fs.rename(
            path.join(appDir, 'next.config.js'),
            path.join(appDir, 'next.config.reactCompiler-base')
          )
        }
      })

      it('emits telemetry for configured React Compiler options', async () => {
        await fs.rename(
          path.join(appDir, 'next.config.reactCompiler-options'),
          path.join(appDir, 'next.config.js')
        )

        let stderr
        try {
          const app = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })
          stderr = app.stderr
          const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
            .exec(stderr)
            .pop()

          expect(event).toMatch(/"reactCompiler": true/)
          expect(event).toMatch(/"reactCompilerCompilationMode": "annotation"/)
          expect(event).toMatch(
            /"reactCompilerPanicThreshold": "CRITICAL_ERRORS"/
          )
        } catch (err) {
          require('console').error('failing stderr', stderr, err)
          throw err
        } finally {
          await fs.rename(
            path.join(appDir, 'next.config.js'),
            path.join(appDir, 'next.config.reactCompiler-options')
          )
        }
      })

      // TODO: support use cache tracking in Turbopack
      ;(process.env.TURBOPACK ? it.skip : it)(
        'emits telemetry for useCache directive',
        async () => {
          // use cache depends on dynamicIO flag
          await fs.rename(
            path.join(appDir, 'next.config.use-cache'),
            path.join(appDir, 'next.config.js')
          )

          await fs.move(path.join(appDir, 'app'), path.join(appDir, '~app'))
          await fs.move(path.join(appDir, '_app'), path.join(appDir, 'app'))

          const { stderr } = await nextBuild(appDir, [], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: 1 },
          })

          await fs.rename(
            path.join(appDir, 'next.config.js'),
            path.join(appDir, 'next.config.use-cache')
          )

          await fs.move(path.join(appDir, 'app'), path.join(appDir, '_app'))
          await fs.move(path.join(appDir, '~app'), path.join(appDir, 'app'))

          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
            'NEXT_BUILD_FEATURE_USAGE'
          )

          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'useCache/default',
            invocationCount: 2,
          })

          // eslint-disable-next-line jest/no-standalone-expect
          expect(featureUsageEvents).toContainEqual({
            featureName: 'useCache/custom',
            invocationCount: 3,
          })
        }
      )
    }
  )
})
