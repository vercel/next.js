/* eslint-disable jest/no-standalone-expect */
import type { ChildProcess } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  findAllTelemetryEvents,
  findPort,
  killApp,
  retry,
} from 'next-test-utils'

describe('config telemetry', () => {
  const { next, isNextStart, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  async function launchDevServer(
    port: number,
    opts: {
      env?: Record<string, string>
      onStderr?: (msg: string) => void
      onStdout?: (msg: string) => void
    } = {}
  ): Promise<{ child: ChildProcess; exit: Promise<any> }> {
    let child!: ChildProcess
    let ready = false
    let resolveReady!: () => void
    const readyPromise = new Promise<void>((r) => {
      resolveReady = () => {
        if (!ready) {
          ready = true
          r()
        }
      }
    })

    const readyPattern = /- Local:|✓ Ready/i
    const exit = next
      .runCommand(['dev', next.testDir, '-p', String(port)], {
        env: opts.env,
        onStdout(msg) {
          opts.onStdout?.(msg)
          if (readyPattern.test(msg)) resolveReady()
        },
        onStderr(msg) {
          opts.onStderr?.(msg)
          if (readyPattern.test(msg)) resolveReady()
        },
        instance: (p) => {
          child = p
        },
      })
      .finally(() => {
        resolveReady()
      })

    await readyPromise
    return { child, exit }
  }

  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    it('detects rewrites, headers, and redirects for next build', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.custom-routes'),
        path.join(next.testDir, 'next.config.js')
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.custom-routes')
      )

      try {
        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()
        expect(event1).toMatch(/"headersCount": 1/)
        expect(event1).toMatch(/"rewritesCount": 2/)
        expect(event1).toMatch(/"redirectsCount": 1/)
        expect(event1).toMatch(/"middlewareCount": 0/)
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      }
    })

    it('detects i18n and image configs for session start', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.i18n-images'),
        path.join(next.testDir, 'next.config.js')
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.i18n-images')
      )

      try {
        const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event1).toMatch(/"i18nEnabled": true/)
        expect(event1).toMatch(/"locales": "en,nl,fr"/)
        expect(event1).toMatch(/"localeDomainsCount": 2/)
        expect(event1).toMatch(/"localeDetectionEnabled": true/)
        expect(event1).toMatch(/"imageEnabled": true/)
        expect(event1).toMatch(/"imageFutureEnabled": true/)
        expect(event1).toMatch(/"imageDomainsCount": 2/)
        expect(event1).toMatch(/"imageRemotePatternsCount": 1/)
        expect(event1).toMatch(/"imageLocalPatternsCount": 3/)
        expect(event1).toMatch(/"imageSizes": "64,128,256,512,1024"/)
        expect(event1).toMatch(/"imageQualities": "25,50,75"/)
        expect(event1).toMatch(/"imageFormats": "image\/avif,image\/webp"/)
        expect(event1).toMatch(/"nextConfigOutput": null/)
        expect(event1).toMatch(/"trailingSlashEnabled": false/)
        expect(event1).toMatch(/"reactStrictMode": false/)
        if (isTurbopack) {
          expect(event1).toMatch(/"turboFlag": true/)
        } else {
          expect(event1).toMatch(/"turboFlag": false/)
        }
        expect(event1).toMatch(/"pagesDir": true/)
        expect(event1).toMatch(/"appDir": true/)
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      }

      await fs.rename(
        path.join(next.testDir, 'next.config.i18n-images'),
        path.join(next.testDir, 'next.config.js')
      )

      let stderr2 = ''

      const { child, exit } = await launchDevServer(await findPort(), {
        onStderr(msg) {
          stderr2 += msg || ''
        },
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
      await retry(async () => {
        expect(stderr2).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await killApp(child)
      await exit.catch(() => {})

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.i18n-images')
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
        expect(event2).toMatch(/"imageLocalPatternsCount": 3/)
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
        path.join(next.testDir, 'next.config.js'),
        'module.exports = { output: "export" }'
      )
      try {
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        try {
          const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
            .exec(cliOutput)
            .pop()

          expect(event1).toContain('"nextConfigOutput": "export"')
        } catch (err) {
          require('console').error('failing cliOutput', cliOutput, err)
          throw err
        }
      } finally {
        await fs.remove(path.join(next.testDir, 'next.config.js'))
      }
    })

    it('emits telemery for usage of image, script & dynamic', async () => {
      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })
      const featureUsageEvents = findAllTelemetryEvents(
        cliOutput,
        'NEXT_BUILD_FEATURE_USAGE'
      )

      expect(featureUsageEvents).toEqual(
        expect.arrayContaining([
          {
            featureName: 'next/image',
            // FIXME: Webpack is missing a reference, Should be +1 from App Router
            invocationCount: isTurbopack ? 3 : 2,
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

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for usage of swc',
      async () => {
        await fs.remove(path.join(next.testDir, 'next.config.js'))
        await fs.remove(path.join(next.testDir, 'jsconfig.json'))
        await fs.rename(
          path.join(next.testDir, 'next.config.swc'),
          path.join(next.testDir, 'next.config.js')
        )
        await fs.rename(
          path.join(next.testDir, 'jsconfig.swc'),
          path.join(next.testDir, 'jsconfig.json')
        )
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.swc')
        )
        await fs.rename(
          path.join(next.testDir, 'jsconfig.json'),
          path.join(next.testDir, 'jsconfig.swc')
        )
        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
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

    it('emits telemetry for usage of `experimental/cacheComponents`', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.cache-components'),
        path.join(next.testDir, 'next.config.js')
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.cache-components')
      )

      const events = findAllTelemetryEvents(
        cliOutput,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(events).toContainEqual({
        featureName: 'experimental/cacheComponents',
        invocationCount: 1,
      })
    })

    // `experimental.optimizeCss` is a webpack-only feature that relies on
    // `critters`; Turbopack does not emit this feature usage event.
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for usage of `optimizeCss`',
      async () => {
        await fs.rename(
          path.join(next.testDir, 'next.config.optimize-css'),
          path.join(next.testDir, 'next.config.js')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.optimize-css')
        )

        const events = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(events).toContainEqual({
          featureName: 'experimental/optimizeCss',
          invocationCount: 1,
        })
      }
    )

    it('emits telemetry for usage of `nextScriptWorkers`', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.next-script-workers'),
        path.join(next.testDir, 'next.config.js')
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.next-script-workers')
      )

      const featureUsageEvents = findAllTelemetryEvents(
        cliOutput,
        'NEXT_BUILD_FEATURE_USAGE'
      )
      expect(featureUsageEvents).toContainEqual({
        featureName: 'experimental/nextScriptWorkers',
        invocationCount: 1,
      })
    })

    it('emits telemetry for usage of `adapterPath`', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.adapter-path'),
        path.join(next.testDir, 'next.config.js')
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.rename(
        path.join(next.testDir, 'next.config.js'),
        path.join(next.testDir, 'next.config.adapter-path')
      )

      try {
        const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event1).toMatch(/"adapterPath": true/)
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      }
    })

    it('emits telemetry for usage of middleware', async () => {
      await fs.writeFile(
        path.join(next.testDir, 'middleware.js'),
        `export function middleware () { }`
      )

      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      await fs.remove(path.join(next.testDir, 'middleware.js'))

      const buildOptimizedEvents = findAllTelemetryEvents(
        cliOutput,
        'NEXT_BUILD_OPTIMIZED'
      )
      expect(buildOptimizedEvents).toContainEqual(
        expect.objectContaining({
          middlewareCount: 1,
        })
      )
    })

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for usage of swc plugins',
      async () => {
        const originalPkg = await fs.readFile(
          path.join(next.testDir, 'package.json'),
          'utf8'
        )
        const swcPluginsPkg = await fs.readFile(
          path.join(next.testDir, 'package.swc-plugins'),
          'utf8'
        )

        // Merge the swc plugins fields into the existing package.json so we
        // keep `packageManager` and other generated fields.
        const merged = JSON.stringify({
          ...JSON.parse(originalPkg),
          ...JSON.parse(swcPluginsPkg),
        })
        await fs.writeFile(path.join(next.testDir, 'package.json'), merged)
        await fs.rename(
          path.join(next.testDir, 'next.config.swc-plugins'),
          path.join(next.testDir, 'next.config.js')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.swc-plugins')
        )
        await fs.writeFile(path.join(next.testDir, 'package.json'), originalPkg)

        const pluginDetectedEvents = findAllTelemetryEvents(
          cliOutput,
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
      }
    )

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for usage of next/legacy/image',
      async () => {
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })
        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
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
      }
    )

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for usage of @vercel/og',
      async () => {
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })
        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(featureUsageEvents).toContainEqual({
          featureName: 'vercelImageGeneration',
          invocationCount: 1,
        })
      }
    )

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for transpilePackages',
      async () => {
        await fs.rename(
          path.join(next.testDir, 'next.config.transpile-packages'),
          path.join(next.testDir, 'next.config.js')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.transpile-packages')
        )

        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(featureUsageEvents).toContainEqual({
          featureName: 'transpilePackages',
          invocationCount: 1,
        })
      }
    )

    // Turbopack intentionally does not support these events
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for middleware related options',
      async () => {
        await fs.rename(
          path.join(next.testDir, 'next.config.middleware-options'),
          path.join(next.testDir, 'next.config.js')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.middleware-options')
        )

        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )
        expect(featureUsageEvents).toContainEqual({
          featureName: 'skipProxyUrlNormalize',
          invocationCount: 1,
        })
        expect(featureUsageEvents).toContainEqual({
          featureName: 'skipTrailingSlashRedirect',
          invocationCount: 1,
        })
      }
    )

    it('emits telemetry for default React Compiler options', async () => {
      const { cliOutput } = await next.build({
        env: { NEXT_TELEMETRY_DEBUG: '1' },
      })

      try {
        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"reactCompiler": false/)
        expect(event).toMatch(/"reactCompilerCompilationMode": null/)
        expect(event).toMatch(/"reactCompilerPanicThreshold": null/)
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      }
    })

    it('emits telemetry for enabled React Compiler', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.reactCompiler-base'),
        path.join(next.testDir, 'next.config.js')
      )

      let cliOutput: string | undefined
      try {
        const result = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })
        cliOutput = result.cliOutput
        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"reactCompiler": true/)
        expect(event).toMatch(/"reactCompilerCompilationMode": null/)
        expect(event).toMatch(/"reactCompilerPanicThreshold": null/)
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      } finally {
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.reactCompiler-base')
        )
      }
    })

    it('emits telemetry for configured React Compiler options', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.reactCompiler-options'),
        path.join(next.testDir, 'next.config.js')
      )

      let cliOutput: string | undefined
      try {
        const result = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })
        cliOutput = result.cliOutput
        const event = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
          .pop()

        expect(event).toMatch(/"reactCompiler": true/)
        expect(event).toMatch(/"reactCompilerCompilationMode": "annotation"/)
        expect(event).toMatch(
          /"reactCompilerPanicThreshold": "critical_errors"/
        )
      } catch (err) {
        require('console').error('failing cliOutput', cliOutput, err)
        throw err
      } finally {
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.reactCompiler-options')
        )
      }
    })

    // TODO: support use cache tracking in Turbopack
    ;(isTurbopack ? it.skip : it)(
      'emits telemetry for useCache directive',
      async () => {
        // use cache depends on cacheComponents flag
        await fs.rename(
          path.join(next.testDir, 'next.config.use-cache'),
          path.join(next.testDir, 'next.config.js')
        )

        await fs.move(
          path.join(next.testDir, 'app'),
          path.join(next.testDir, '~app')
        )
        await fs.move(
          path.join(next.testDir, '_app'),
          path.join(next.testDir, 'app')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.use-cache')
        )

        await fs.move(
          path.join(next.testDir, 'app'),
          path.join(next.testDir, '_app')
        )
        await fs.move(
          path.join(next.testDir, '~app'),
          path.join(next.testDir, 'app')
        )

        const featureUsageEvents = findAllTelemetryEvents(
          cliOutput,
          'NEXT_BUILD_FEATURE_USAGE'
        )

        expect(featureUsageEvents).toContainEqual({
          featureName: 'useCache/default',
          invocationCount: 2,
        })

        expect(featureUsageEvents).toContainEqual({
          featureName: 'useCache/custom',
          invocationCount: 3,
        })
      }
    )

    it('emits telemetry for filesystem cache in build mode', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.filesystem-cache'),
        path.join(next.testDir, 'next.config.js')
      )

      try {
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        try {
          const featureUsageEvents = findAllTelemetryEvents(
            cliOutput,
            'NEXT_BUILD_FEATURE_USAGE'
          )
          expect(featureUsageEvents).toContainEqual({
            featureName: 'turbopackFileSystemCache',
            invocationCount: 1,
          })
        } catch (err) {
          require('console').error('failing cliOutput', cliOutput, err)
          throw err
        }
      } finally {
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.filesystem-cache')
        )
      }
    })

    it('emits telemetry for filesystem cache in dev mode', async () => {
      await fs.rename(
        path.join(next.testDir, 'next.config.filesystem-cache'),
        path.join(next.testDir, 'next.config.js')
      )

      let child: ChildProcess | undefined
      let exitPromise: Promise<any> | undefined
      let stderr = ''

      try {
        const result = await launchDevServer(await findPort(), {
          env: { NEXT_TELEMETRY_DEBUG: '1' },
          onStderr(msg) {
            stderr += msg || ''
          },
        })
        child = result.child
        exitPromise = result.exit

        await retry(async () => {
          const featureUsageEvents = findAllTelemetryEvents(
            stderr,
            'NEXT_BUILD_FEATURE_USAGE'
          )
          expect(featureUsageEvents).toContainEqual({
            featureName: 'turbopackFileSystemCache',
            invocationCount: 1,
          })
        })
      } catch (err) {
        require('console').error('failing stderr', err)
        throw err
      } finally {
        if (child) {
          await killApp(child)
        }
        if (exitPromise) {
          await exitPromise.catch(() => {})
        }
        await fs.rename(
          path.join(next.testDir, 'next.config.js'),
          path.join(next.testDir, 'next.config.filesystem-cache')
        )
      }
    })
  })
})
