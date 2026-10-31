import path from 'path'
import qs from 'querystring'
import Watchpack from 'next/dist/compiled/watchpack'
import type {
  DevelopmentDiscovery,
  RawEntrypoints,
} from '../../../build/swc/types'
import { createDefineEnv } from '../../../build/swc'
import { createClientRouterFilter } from '../../../lib/create-client-router-filter'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { generateInterceptionRoutesRewrites } from '../../../lib/generate-interception-routes-rewrites'
import { sortByPageExts } from '../../../build/sort-by-page-exts'
import {
  getPossibleInstrumentationHookFilenames,
  getPossibleMiddlewareFilenames,
  NestedMiddlewareError,
} from '../../../build/utils'
import * as Log from '../../../build/output/log'
import { cyan } from '../../../lib/picocolors'
import type { RouteInfo } from '../../../build/file-classifier'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'
import { buildCustomRoute } from './filesystem'
import { createTurbopackDevRouteSnapshot } from './dev-route-snapshot'
import {
  createMiddlewareCandidates,
  reportMiddlewareDiagnostics,
} from './dev-root-file-diagnostics'
import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
} from './route-types-utils'
import { writeCacheLifeTypes } from './cache-life-type-utils'
import { writeRootParamsTypes } from './root-params-type-utils'
import {
  propagateServerField,
  verifyTypeScript,
  type ServerFields,
  type SetupOpts,
} from './setup-dev-bundler'

/** Publishes native discovery without independently walking app/ or pages/. */
export async function createTurbopackRoutePublisher(
  opts: SetupOpts,
  serverFields: ServerFields,
  distDir: string
) {
  const { nextConfig, dir } = opts
  const middlewareCandidates = createMiddlewareCandidates(
    dir,
    nextConfig.pageExtensions
  )
  const typesDir = path.join(distDir, 'types')
  const validatorFilePath = path.join(typesDir, 'validator.ts')
  let sortedRoutes: string[] = []
  let development: DevelopmentDiscovery | undefined
  let previousFilters: string | undefined
  let previousTooling: string | undefined
  let wroteEnvTypes = false
  let previousDuplicates = new Set<string>()
  let previousNestedMiddleware = ''
  let clientRouterFilters:
    | ReturnType<typeof createClientRouterFilter>
    | undefined
  // Keep Next's one-time TypeScript setup scan. Subsequent discoveries come
  // from the native inventory, including unimported helpers and private folders.
  let enabledTypeScript = await verifyTypeScript(opts)
  const configuredBeforeFiles = [...opts.fsChecker.rewrites.beforeFiles]

  function reportAuthoredDiagnostics(inventory: DevelopmentDiscovery) {
    const pages = new Map<string, string>()
    const duplicates = new Set<string>()
    const nestedMiddleware: string[] = []
    for (const file of inventory.files) {
      if (file.kind !== 'pages' && file.kind !== 'pages-api') continue
      const previous = pages.get(file.originalName)
      if (previous) {
        duplicates.add(file.originalName)
        if (!previousDuplicates.has(file.originalName)) {
          Log.warn(
            `Duplicate page detected. ${cyan(path.posix.join('pages', path.relative(opts.pagesDir!, previous).replace(/\\/g, '/')))} and ${cyan(path.posix.join('pages', path.relative(opts.pagesDir!, file.sourcePath).replace(/\\/g, '/')))} both resolve to ${cyan(file.originalName)}.`
          )
        }
      }
      pages.set(file.originalName, file.sourcePath)
      if (file.originalName.endsWith('/_middleware')) {
        nestedMiddleware.push(file.originalName)
      }
      if (nextConfig.output === 'export' && file.kind === 'pages-api') {
        Log.error(
          'API Routes cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
        )
      }
    }
    previousDuplicates = duplicates
    const signature = nestedMiddleware.sort().join('\n')
    if (signature && signature !== previousNestedMiddleware) {
      Log.error(
        new NestedMiddlewareError(
          nestedMiddleware,
          dir,
          (opts.pagesDir || opts.appDir)!
        ).message
      )
    }
    previousNestedMiddleware = signature
  }

  async function updateExportPathMap() {
    if (typeof nextConfig.exportPathMap !== 'function') return
    const entries = Object.entries(
      (await nextConfig.exportPathMap(
        {},
        {
          dev: true,
          dir,
          outDir: null,
          distDir,
          buildId: 'development',
        }
      )) || {}
    )
    opts.fsChecker.exportPathMapRoutes = entries.map(([source, value]) =>
      buildCustomRoute(
        'before_files_rewrite',
        {
          source,
          destination: `${value.page}${value.query ? '?' : ''}${qs.stringify(value.query)}`,
        },
        nextConfig.basePath,
        nextConfig.experimental.caseSensitiveRoutes
      )
    )
  }

  async function writeTooling(inventory: DevelopmentDiscovery) {
    if (!enabledTypeScript && inventory.hasTypeScriptFiles) {
      enabledTypeScript = await verifyTypeScript(opts).catch(() => false)
    }
    if (!enabledTypeScript) return
    const signature = JSON.stringify(inventory)
    if (signature === previousTooling) return
    const pageRoutes: RouteInfo[] = []
    const pageApiRoutes: RouteInfo[] = []
    const appRoutes: RouteInfo[] = []
    const appRouteHandlers: RouteInfo[] = []
    const layoutRoutes: RouteInfo[] = []
    // Preserve extension priority for duplicate authored candidates, including
    // files excluded from the executable inventory by strict route matching.
    const compare = sortByPageExts(nextConfig.pageExtensions)
    for (const file of [...inventory.files].sort((a, b) =>
      compare(a.sourcePath, b.sourcePath)
    )) {
      const route = normalizeAppPath(file.originalName).replace(/%5F/g, '_')
      const item = { route, filePath: file.sourcePath }
      switch (file.kind) {
        case 'pages':
          pageRoutes.push({ ...item, route: file.originalName })
          break
        case 'pages-api':
          pageApiRoutes.push({ ...item, route: file.originalName })
          break
        case 'app-page':
          appRoutes.push(item)
          break
        case 'app-route':
          appRouteHandlers.push(item)
          break
        case 'app-metadata':
          if (file.runtimePathname) {
            appRouteHandlers.push({ ...item, route: file.runtimePathname })
          }
          break
        case 'app-layout':
          layoutRoutes.push({
            ...item,
            route: route.replace(/\/layout$/, '') || '/',
          })
          break
        case 'app-default':
        case 'app-special':
          // Defaults and special files (error, loading, not-found and so on)
          // have no route types of their own.
          break
      }
    }
    const manifest = await createRouteTypesManifest({
      dir,
      pageRoutes,
      pageApiRoutes,
      appRoutes,
      appRouteHandlers,
      layoutRoutes,
      slots: inventory.slots,
      redirects: nextConfig.redirects,
      rewrites: nextConfig.rewrites,
      validatorFilePath,
    })
    await writeRouteTypesManifest(
      manifest,
      path.join(typesDir, 'routes.d.ts'),
      nextConfig
    )
    await writeValidatorFile(
      manifest,
      validatorFilePath,
      Boolean(nextConfig.experimental.strictRouteTypes)
    )
    writeCacheLifeTypes(
      nextConfig.cacheLife,
      path.join(typesDir, 'cache-life.d.ts')
    )
    await writeRootParamsTypes(
      manifest,
      path.join(typesDir, 'root-params.d.ts')
    )
    previousTooling = signature
  }

  async function writeEnvTypes(force = false) {
    if (!enabledTypeScript || !nextConfig.experimental.typedEnv) return
    if (wroteEnvTypes && !force) return
    const { loadEnvConfig } = require('@next/env') as typeof import('@next/env')
    const { createEnvDefinitions } =
      require('../experimental/create-env-definitions') as typeof import('../experimental/create-env-definitions')
    // `next dev` can run with NODE_ENV=production, which loads the production
    // env files instead of the development ones.
    const { loadedEnvFiles } = loadEnvConfig(
      dir,
      process.env.NODE_ENV === 'development',
      undefined,
      true
    )
    await createEnvDefinitions({
      distDir,
      loadedEnvFiles: [
        ...loadedEnvFiles,
        {
          path: nextConfig.configFileName || 'next.config.js',
          env: nextConfig.env,
          contents: '',
        },
      ],
    })
    wroteEnvTypes = true
  }

  async function updateDefines(hotReloader: NextJsHotReloaderInterface) {
    const rewrites = opts.fsChecker.rewrites
    await hotReloader.turbopackProject!.update({
      defineEnv: createDefineEnv({
        isTurbopack: true,
        clientRouterFilters,
        config: nextConfig,
        dev: true,
        distDir,
        fetchCacheKeyPrefix: nextConfig.experimental.fetchCacheKeyPrefix,
        hasRewrites:
          rewrites.beforeFiles.length > 0 ||
          rewrites.afterFiles.length > 0 ||
          rewrites.fallback.length > 0,
        middlewareMatchers: undefined,
        projectPath: dir,
        rewrites,
      }),
    })
  }

  let pendingPublication = Promise.resolve()
  function enqueue(action: () => Promise<void>) {
    const result = pendingPublication.then(action)
    // A failed update must not prevent a later file/config edit from retrying.
    pendingPublication = result.catch(() => {})
    return result
  }
  let published = false

  return {
    get sortedRoutes() {
      return sortedRoutes
    },
    // This method must stay synchronous: install routing state together with
    // the compiler endpoint map before endpoint cleanup or manifest writes.
    install(entrypoints: RawEntrypoints) {
      if (nextConfig.output === 'export' && entrypoints.middleware) {
        Log.error(
          'Middleware cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
        )
      }
      const snapshot = createTurbopackDevRouteSnapshot(entrypoints, nextConfig)
      const interceptionRoutes = generateInterceptionRoutesRewrites(
        Object.keys(snapshot.appPathRoutes),
        nextConfig.basePath
      ).map((route) =>
        buildCustomRoute(
          'before_files_rewrite',
          route,
          nextConfig.basePath,
          nextConfig.experimental.caseSensitiveRoutes
        )
      )
      // Finish all route validation before replacing the last valid inventory.
      // Invalid routes are recoverable when the user fixes the next file edit.
      opts.fsChecker.replaceDevRoutes(snapshot.routes)
      sortedRoutes = snapshot.sortedRoutes
      serverFields.appPathRoutes = snapshot.appPathRoutes
      serverFields.hasAppNotFound =
        entrypoints.development?.hasRootNotFound ?? false
      // Replace generated rewrites instead of appending another copy on edits.
      opts.fsChecker.rewrites.beforeFiles.splice(
        0,
        Infinity,
        ...configuredBeforeFiles,
        ...interceptionRoutes
      )
      return snapshot
    },
    async publish(
      hotReloader: NextJsHotReloaderInterface,
      inventory?: DevelopmentDiscovery,
      runtimeChanged = false
    ) {
      // Publication runs user callbacks: rewrites() and redirects() for route
      // types, and exportPathMap. As with the old route watcher, a failure in
      // the first publication fails startup, and later failures are logged so
      // a callback that throws cannot stop a running dev server.
      const isStartup = !published
      published = true
      return enqueue(async () => {
        try {
          if (inventory) {
            development = inventory
            reportAuthoredDiagnostics(inventory)
          }
          if (runtimeChanged) {
            await propagateServerField(
              opts,
              'appPathRoutes',
              serverFields.appPathRoutes
            )
            if (nextConfig.experimental.clientRouterFilter) {
              clientRouterFilters = createClientRouterFilter(
                Object.keys(serverFields.appPathRoutes || {}),
                nextConfig.experimental.clientRouterFilterRedirects
                  ? (opts.fsChecker.originalRedirects || []).filter(
                      (r) => !r.internal
                    )
                  : [],
                nextConfig.experimental.clientRouterFilterAllowedRate
              )
              const signature = JSON.stringify(clientRouterFilters)
              if (signature !== previousFilters) {
                previousFilters = signature
                await updateDefines(hotReloader)
              }
            }
          }
          if (inventory) await writeTooling(inventory)
          await updateExportPathMap()
          await writeEnvTypes()
        } catch (error) {
          if (isStartup) throw error
          Log.warn('Failed to reload dynamic routes:', error)
        }
      })
    },
    async watchConfig(hotReloader: NextJsHotReloaderInterface) {
      const envFiles = [
        '.env.development.local',
        '.env.local',
        '.env.development',
        '.env',
      ].map((file) => path.join(dir, file))
      const configFiles = [
        path.join(dir, nextConfig.typescript.tsconfigPath || 'tsconfig.json'),
        path.join(dir, 'jsconfig.json'),
      ]
      const middlewareFiles = middlewareCandidates.map((file) => file.filePath)
      const files = [...envFiles, ...configFiles, ...middlewareFiles]
      const watcher = new Watchpack({ aggregateTimeout: 5 })
      let pending = Promise.resolve()
      watcher.on(
        'aggregated',
        (changes: Set<string>, removals: Set<string>) => {
          pending = pending
            .then(() =>
              enqueue(async () => {
                const changed = new Set([...changes, ...removals])
                if (middlewareFiles.some((file) => changed.has(file))) {
                  await reportMiddlewareDiagnostics(
                    middlewareCandidates,
                    nextConfig
                  )
                }
                const envChanged = envFiles.some((file) => changed.has(file))
                if (
                  !envChanged &&
                  !configFiles.some((file) => changed.has(file))
                )
                  return
                if (envChanged)
                  await propagateServerField(opts, 'loadEnvConfig', [
                    { dev: true, forceReload: true },
                  ])
                if (!enabledTypeScript)
                  enabledTypeScript = await verifyTypeScript(opts)
                await updateDefines(hotReloader)
                await hotReloader.invalidate({
                  reloadAfterInvalidation: envChanged,
                })
                if (development) await writeTooling(development)
                await updateExportPathMap()
                await writeEnvTypes(true)
              })
            )
            .catch((err) => {
              console.error(err)
            })
        }
      )
      // Explicit files only. Turbopack owns all recursive route observation.
      watcher.watch({ files, missing: files, startTime: Date.now() })

      let exportPathMapWatcher: Watchpack | undefined
      if (typeof nextConfig.exportPathMap === 'function') {
        const directories = [opts.pagesDir, opts.appDir].filter(
          (directory): directory is string => !!directory
        )
        const rootDir = opts.pagesDir || opts.appDir
        const exportPathMapFiles = [
          ...files,
          path.join(dir, 'tsconfig.json'),
          ...getPossibleMiddlewareFilenames(
            path.join(rootDir!, '..'),
            nextConfig.pageExtensions
          ),
          ...getPossibleInstrumentationHookFilenames(
            path.join(rootDir!, '..'),
            nextConfig.pageExtensions
          ),
        ]
        // Legacy exportPathMap callbacks can read route-directory helpers with
        // Node's fs, outside native dependency tracking. Preserve immediate
        // updates only for that callback; native discovery still owns routes.
        exportPathMapWatcher = new Watchpack({
          aggregateTimeout: 5,
          ignored: (pathname: string) =>
            !exportPathMapFiles.some((file) => file.startsWith(pathname)) &&
            !directories.some(
              (directory) =>
                pathname.startsWith(directory) || directory.startsWith(pathname)
            ),
        })
        exportPathMapWatcher.on('aggregated', () => {
          pending = pending
            .then(() => enqueue(updateExportPathMap))
            .catch((err) => {
              console.error(err)
            })
        })
        exportPathMapWatcher.watch({ directories: [dir], startTime: 0 })
      }
      opts.onDevServerCleanup?.(async () => {
        watcher.close()
        exportPathMapWatcher?.close()
        await pending
        await pendingPublication
      })
      await enqueue(async () => {
        await reportMiddlewareDiagnostics(middlewareCandidates, nextConfig)
        await writeEnvTypes()
      })
    },
  }
}

export type TurbopackRoutePublisher = Awaited<
  ReturnType<typeof createTurbopackRoutePublisher>
>
