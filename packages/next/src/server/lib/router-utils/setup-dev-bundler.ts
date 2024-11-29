import type { NextConfigComplete } from '../../config-shared'
import type { FilesystemDynamicRoute } from './filesystem'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import {
  getPageStaticInfo,
  type MiddlewareMatcher,
} from '../../../build/analysis/get-page-static-info'
import type { MiddlewareRouteMatch } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { PropagateToWorkersField } from './types'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'

import { createDefineEnv } from '../../../build/swc'
import type { Project } from '../../../build/swc/types'
import fs from 'fs'
import { mkdir } from 'fs/promises'
import url from 'url'
import path from 'path'
import qs from 'querystring'
import Watchpack from 'next/dist/compiled/watchpack'
import { loadEnvConfig } from '@next/env'
import isError, { type NextError } from '../../../lib/is-error'
import findUp from 'next/dist/compiled/find-up'
import { buildCustomRoute } from './filesystem'
import * as Log from '../../../build/output/log'
import HotReloaderWebpack from '../../dev/hot-reloader-webpack'
import { setGlobal } from '../../../trace/shared'
import type { Telemetry } from '../../../telemetry/storage'
import type { IncomingMessage, ServerResponse } from 'http'
import loadJsConfig from '../../../build/load-jsconfig'
import { createValidFileMatcher } from '../find-page-file'
import { eventCliSession } from '../../../telemetry/events'
import { getDefineEnv } from '../../../build/webpack/plugins/define-env-plugin'
import { logAppDirError } from '../../dev/log-app-dir-error'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import {
  getStaticInfoIncludingLayouts,
  sortByPageExts,
} from '../../../build/entries'
import { verifyTypeScriptSetup } from '../../../lib/verify-typescript-setup'
import { verifyPartytownSetup } from '../../../lib/verify-partytown-setup'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { buildDataRoute } from './build-data-route'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { createClientRouterFilter } from '../../../lib/create-client-router-filter'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { generateInterceptionRoutesRewrites } from '../../../lib/generate-interception-routes-rewrites'

import {
  CLIENT_STATIC_FILES_PATH,
  COMPILER_NAMES,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_CLIENT_MIDDLEWARE_MANIFEST,
  PHASE_DEVELOPMENT_SERVER,
} from '../../../shared/lib/constants'

import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  isMiddlewareFile,
  NestedMiddlewareError,
  isInstrumentationHookFile,
  getPossibleMiddlewareFilenames,
  getPossibleInstrumentationHookFilenames,
} from '../../../build/utils'
import {
  createOriginalStackFrame,
  getSourceMapFromCompilation,
  getSourceMapFromFile,
  parseStack,
  getIgnoredSources,
} from '../../../client/components/react-dev-overlay/server/middleware-webpack'
import {
  batchedTraceSource,
  createOriginalStackFrame as createOriginalTurboStackFrame,
} from '../../../client/components/react-dev-overlay/server/middleware-turbopack'
import type { OriginalStackFrameResponse } from '../../../client/components/react-dev-overlay/server/shared'
import { devPageFiles } from '../../../build/webpack/plugins/next-types-plugin/shared'
import type { LazyRenderServerInstance } from '../router-server'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../dev/hot-reloader-types'
import { PAGE_TYPES } from '../../../lib/page-types'
import { createHotReloaderTurbopack } from '../../dev/hot-reloader-turbopack'
import { getErrorSource } from '../../../shared/lib/error-source'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { generateEncryptionKeyBase64 } from '../../app-render/encryption-utils-server'
import {
  ModuleBuildError,
  TurbopackInternalError,
} from '../../dev/turbopack-utils'
import { isMetadataRouteFile } from '../../../lib/metadata/is-metadata-route'
import { normalizeMetadataPageToRoute } from '../../../lib/metadata/get-metadata-route'
import { createEnvDefinitions } from '../experimental/create-env-definitions'
import { JsConfigPathsPlugin } from '../../../build/webpack/plugins/jsconfig-paths-plugin'
import { store as consoleStore } from '../../../build/output/store'

export type SetupOpts = {
  renderServer: LazyRenderServerInstance
  dir: string
  turbo?: boolean
  appDir?: string
  pagesDir?: string
  telemetry: Telemetry
  isCustomServer?: boolean
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >
  nextConfig: NextConfigComplete
  port: number
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
  resetFetch: () => void
}

export type ServerFields = {
  actualMiddlewareFile?: string | undefined
  actualInstrumentationHookFile?: string | undefined
  appPathRoutes?: Record<string, string | string[]>
  middleware?:
    | {
        page: string
        match: MiddlewareRouteMatch
        matchers?: MiddlewareMatcher[]
      }
    | undefined
  hasAppNotFound?: boolean
  interceptionRoutes?: ReturnType<
    typeof import('./filesystem').buildCustomRoute
  >[]
  setAppIsrStatus?: (key: string, value: boolean) => void
  resetFetch?: () => void
}

async function verifyTypeScript(opts: SetupOpts) {
  let usingTypeScript = false
  const verifyResult = await verifyTypeScriptSetup({
    dir: opts.dir,
    distDir: opts.nextConfig.distDir,
    intentDirs: [opts.pagesDir, opts.appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    tsconfigPath: opts.nextConfig.typescript.tsconfigPath,
    disableStaticImages: opts.nextConfig.images.disableStaticImages,
    hasAppDir: !!opts.appDir,
    hasPagesDir: !!opts.pagesDir,
  })

  if (verifyResult.version) {
    usingTypeScript = true
  }
  return usingTypeScript
}

export async function propagateServerField(
  opts: SetupOpts,
  field: PropagateToWorkersField,
  args: any
) {
  await opts.renderServer?.instance?.propagateServerField(opts.dir, field, args)
}

async function startWatcher(opts: SetupOpts) {
  const { nextConfig, appDir, pagesDir, dir, resetFetch } = opts
  const { useFileSystemPublicRoutes } = nextConfig
  const usingTypeScript = await verifyTypeScript(opts)

  const distDir = path.join(opts.dir, opts.nextConfig.distDir)

  // we ensure the types directory exists here
  if (usingTypeScript) {
    const distTypesDir = path.join(distDir, 'types')
    if (!fs.existsSync(distTypesDir)) {
      await mkdir(distTypesDir, { recursive: true })
    }
  }

  setGlobal('distDir', distDir)
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

  const validFileMatcher = createValidFileMatcher(
    nextConfig.pageExtensions,
    appDir
  )

  const serverFields: ServerFields = {}

  // Update logging state once based on next.config.js when initializing
  consoleStore.setState({
    logging: nextConfig.logging !== false,
  })

  const hotReloader: NextJsHotReloaderInterface = opts.turbo
    ? await createHotReloaderTurbopack(opts, serverFields, distDir, resetFetch)
    : new HotReloaderWebpack(opts.dir, {
        appDir,
        pagesDir,
        distDir,
        config: opts.nextConfig,
        buildId: 'development',
        encryptionKey: await generateEncryptionKeyBase64({
          isBuild: false,
          distDir,
        }),
        telemetry: opts.telemetry,
        rewrites: opts.fsChecker.rewrites,
        previewProps: opts.fsChecker.prerenderManifest.preview,
        resetFetch,
      })

  await hotReloader.start()

  // @ts-expect-error
  globalThis[Symbol.for('@next/dev/hot-reloader')] = hotReloader

  if (opts.nextConfig.experimental.nextScriptWorkers) {
    await verifyPartytownSetup(
      opts.dir,
      path.join(distDir, CLIENT_STATIC_FILES_PATH)
    )
  }

  opts.fsChecker.ensureCallback(async function ensure(item) {
    if (item.type === 'appFile' || item.type === 'pageFile') {
      await hotReloader.ensurePage({
        clientOnly: false,
        page: item.itemPath,
        isApp: item.type === 'appFile',
        definition: undefined,
      })
    }
  })

  let resolved = false
  let prevSortedRoutes: string[] = []

  await new Promise<void>(async (resolve, reject) => {
    if (pagesDir) {
      // Watchpack doesn't emit an event for an empty directory
      fs.readdir(pagesDir, (_, files) => {
        if (files?.length) {
          return
        }

        if (!resolved) {
          resolve()
          resolved = true
        }
      })
    }

    const pages = pagesDir ? [pagesDir] : []
    const app = appDir ? [appDir] : []
    const directories = [...pages, ...app]

    const rootDir = pagesDir || appDir
    const files = [
      ...getPossibleMiddlewareFilenames(
        path.join(rootDir!, '..'),
        nextConfig.pageExtensions
      ),
      ...getPossibleInstrumentationHookFilenames(
        path.join(rootDir!, '..'),
        nextConfig.pageExtensions
      ),
    ]
    let nestedMiddleware: string[] = []

    const envFiles = [
      '.env.development.local',
      '.env.local',
      '.env.development',
      '.env',
    ].map((file) => path.join(dir, file))

    files.push(...envFiles)

    // tsconfig/jsconfig paths hot-reloading
    const tsconfigPaths = [
      path.join(dir, 'tsconfig.json'),
      path.join(dir, 'jsconfig.json'),
    ] as const
    files.push(...tsconfigPaths)

    const wp = new Watchpack({
      ignored: (pathname: string) => {
        return (
          !files.some((file) => file.startsWith(pathname)) &&
          !directories.some(
            (d) => pathname.startsWith(d) || d.startsWith(pathname)
          )
        )
      },
    })
    const fileWatchTimes = new Map()
    let enabledTypeScript = usingTypeScript
    let previousClientRouterFilters: any
    let previousConflictingPagePaths: Set<string> = new Set()

    wp.on('aggregated', async () => {
      let middlewareMatchers: MiddlewareMatcher[] | undefined
      const routedPages: string[] = []
      const knownFiles = wp.getTimeInfoEntries()
      const appPaths: Record<string, string[]> = {}
      const pageNameSet = new Set<string>()
      const conflictingAppPagePaths = new Set<string>()
      const appPageFilePaths = new Map<string, string>()
      const pagesPageFilePaths = new Map<string, string>()
      const pagesWithUnsupportedSegments = new Map<string, string[]>()

      let envChange = false
      let tsconfigChange = false
      let conflictingPageChange = 0
      let hasRootAppNotFound = false

      const { appFiles, pageFiles } = opts.fsChecker

      appFiles.clear()
      pageFiles.clear()
      devPageFiles.clear()
      pagesWithUnsupportedSegments.clear()

      const sortedKnownFiles: string[] = [...knownFiles.keys()].sort(
        sortByPageExts(nextConfig.pageExtensions)
      )

      for (const fileName of sortedKnownFiles) {
        if (
          !files.includes(fileName) &&
          !directories.some((d) => fileName.startsWith(d))
        ) {
          continue
        }
        const meta = knownFiles.get(fileName)

        const watchTime = fileWatchTimes.get(fileName)
        // If the file is showing up for the first time or the meta.timestamp is changed since last time
        const watchTimeChange =
          watchTime === undefined ||
          (watchTime && watchTime !== meta?.timestamp)
        fileWatchTimes.set(fileName, meta?.timestamp)

        if (envFiles.includes(fileName)) {
          if (watchTimeChange) {
            envChange = true
          }
          continue
        }

        if (tsconfigPaths.includes(fileName)) {
          if (fileName.endsWith('tsconfig.json')) {
            enabledTypeScript = true
          }
          if (watchTimeChange) {
            tsconfigChange = true
          }
          continue
        }

        if (
          meta?.accuracy === undefined ||
          !validFileMatcher.isPageFile(fileName)
        ) {
          continue
        }

        const isAppPath = Boolean(
          appDir &&
            normalizePathSep(fileName).startsWith(
              normalizePathSep(appDir) + '/'
            )
        )
        const isPagePath = Boolean(
          pagesDir &&
            normalizePathSep(fileName).startsWith(
              normalizePathSep(pagesDir) + '/'
            )
        )

        const rootFile = absolutePathToPage(fileName, {
          dir: dir,
          extensions: nextConfig.pageExtensions,
          keepIndex: false,
          pagesType: PAGE_TYPES.ROOT,
        })

        if (isMiddlewareFile(rootFile)) {
          const staticInfo = await getStaticInfoIncludingLayouts({
            pageFilePath: fileName,
            config: nextConfig,
            appDir: appDir,
            page: rootFile,
            isDev: true,
            isInsideAppDir: isAppPath,
            pageExtensions: nextConfig.pageExtensions,
          })
          if (nextConfig.output === 'export') {
            Log.error(
              'Middleware cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
            continue
          }
          serverFields.actualMiddlewareFile = rootFile
          await propagateServerField(
            opts,
            'actualMiddlewareFile',
            serverFields.actualMiddlewareFile
          )
          middlewareMatchers = staticInfo.middleware?.matchers || [
            { regexp: '.*', originalSource: '/:path*' },
          ]
          continue
        }
        if (isInstrumentationHookFile(rootFile)) {
          serverFields.actualInstrumentationHookFile = rootFile
          await propagateServerField(
            opts,
            'actualInstrumentationHookFile',
            serverFields.actualInstrumentationHookFile
          )
          continue
        }

        if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
          enabledTypeScript = true
        }

        if (!(isAppPath || isPagePath)) {
          continue
        }

        // Collect all current filenames for the TS plugin to use
        devPageFiles.add(fileName)

        let pageName = absolutePathToPage(fileName, {
          dir: isAppPath ? appDir! : pagesDir!,
          extensions: nextConfig.pageExtensions,
          keepIndex: isAppPath,
          pagesType: isAppPath ? PAGE_TYPES.APP : PAGE_TYPES.PAGES,
        })

        if (
          isAppPath &&
          appDir &&
          isMetadataRouteFile(
            fileName.replace(appDir, ''),
            nextConfig.pageExtensions,
            true
          )
        ) {
          const staticInfo = await getPageStaticInfo({
            pageFilePath: fileName,
            nextConfig: {},
            page: pageName,
            isDev: true,
            pageType: PAGE_TYPES.APP,
          })

          pageName = normalizeMetadataPageToRoute(
            pageName,
            !!(staticInfo.generateSitemaps || staticInfo.generateImageMetadata)
          )
        }

        if (
          !isAppPath &&
          pageName.startsWith('/api/') &&
          nextConfig.output === 'export'
        ) {
          Log.error(
            'API Routes cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
          )
          continue
        }

        if (isAppPath) {
          const isRootNotFound = validFileMatcher.isRootNotFound(fileName)
          hasRootAppNotFound = true

          if (isRootNotFound) {
            continue
          }
          if (!isRootNotFound && !validFileMatcher.isAppRouterPage(fileName)) {
            continue
          }
          // Ignore files/directories starting with `_` in the app directory
          if (normalizePathSep(pageName).includes('/_')) {
            continue
          }

          const originalPageName = pageName
          pageName = normalizeAppPath(pageName).replace(/%5F/g, '_')
          if (!appPaths[pageName]) {
            appPaths[pageName] = []
          }
          appPaths[pageName].push(originalPageName)

          if (useFileSystemPublicRoutes) {
            appFiles.add(pageName)
          }

          if (routedPages.includes(pageName)) {
            continue
          }
        } else {
          if (useFileSystemPublicRoutes) {
            pageFiles.add(pageName)
            // always add to nextDataRoutes for now but in future only add
            // entries that actually use getStaticProps/getServerSideProps
            opts.fsChecker.nextDataRoutes.add(pageName)
          }
        }
        ;(isAppPath ? appPageFilePaths : pagesPageFilePaths).set(
          pageName,
          fileName
        )

        if (appDir && pageNameSet.has(pageName)) {
          conflictingAppPagePaths.add(pageName)
        } else {
          pageNameSet.add(pageName)
        }

        /**
         * If there is a middleware that is not declared in the root we will
         * warn without adding it so it doesn't make its way into the system.
         */
        if (/[\\\\/]_middleware$/.test(pageName)) {
          nestedMiddleware.push(pageName)
          continue
        }

        routedPages.push(pageName)
      }

      const numConflicting = conflictingAppPagePaths.size
      conflictingPageChange = numConflicting - previousConflictingPagePaths.size

      if (conflictingPageChange !== 0) {
        if (numConflicting > 0) {
          let errorMessage = `Conflicting app and page file${
            numConflicting === 1 ? ' was' : 's were'
          } found, please remove the conflicting files to continue:\n`

          for (const p of conflictingAppPagePaths) {
            const appPath = path.relative(dir, appPageFilePaths.get(p)!)
            const pagesPath = path.relative(dir, pagesPageFilePaths.get(p)!)
            errorMessage += `  "${pagesPath}" - "${appPath}"\n`
          }
          hotReloader.setHmrServerError(new Error(errorMessage))
        } else if (numConflicting === 0) {
          hotReloader.clearHmrServerError()
          await propagateServerField(opts, 'reloadMatchers', undefined)
        }
      }

      previousConflictingPagePaths = conflictingAppPagePaths

      let clientRouterFilters: any
      if (nextConfig.experimental.clientRouterFilter) {
        clientRouterFilters = createClientRouterFilter(
          Object.keys(appPaths),
          nextConfig.experimental.clientRouterFilterRedirects
            ? ((nextConfig as any)._originalRedirects || []).filter(
                (r: any) => !r.internal
              )
            : [],
          nextConfig.experimental.clientRouterFilterAllowedRate
        )

        if (
          !previousClientRouterFilters ||
          JSON.stringify(previousClientRouterFilters) !==
            JSON.stringify(clientRouterFilters)
        ) {
          envChange = true
          previousClientRouterFilters = clientRouterFilters
        }
      }

      if (!usingTypeScript && enabledTypeScript) {
        // we tolerate the error here as this is best effort
        // and the manual install command will be shown
        await verifyTypeScript(opts)
          .then(() => {
            tsconfigChange = true
          })
          .catch(() => {})
      }

      if (envChange || tsconfigChange) {
        if (envChange) {
          const { loadedEnvFiles } = loadEnvConfig(
            dir,
            process.env.NODE_ENV === 'development',
            Log,
            true,
            (envFilePath) => {
              Log.info(`Reload env: ${envFilePath}`)
            }
          )

          if (usingTypeScript && nextConfig.experimental?.typedEnv) {
            // do not await, this is not essential for further process
            createEnvDefinitions({
              distDir,
              loadedEnvFiles: [
                ...loadedEnvFiles,
                {
                  path: nextConfig.configFileName,
                  env: nextConfig.env,
                  contents: '',
                },
              ],
            })
          }

          await propagateServerField(opts, 'loadEnvConfig', [
            { dev: true, forceReload: true, silent: true },
          ])
        }
        let tsconfigResult:
          | UnwrapPromise<ReturnType<typeof loadJsConfig>>
          | undefined

        if (tsconfigChange) {
          try {
            tsconfigResult = await loadJsConfig(dir, nextConfig)
          } catch (_) {
            /* do we want to log if there are syntax errors in tsconfig while editing? */
          }
        }

        if (hotReloader.turbopackProject) {
          const hasRewrites =
            opts.fsChecker.rewrites.afterFiles.length > 0 ||
            opts.fsChecker.rewrites.beforeFiles.length > 0 ||
            opts.fsChecker.rewrites.fallback.length > 0

          await hotReloader.turbopackProject.update({
            defineEnv: createDefineEnv({
              isTurbopack: true,
              clientRouterFilters,
              config: nextConfig,
              dev: true,
              distDir,
              fetchCacheKeyPrefix:
                opts.nextConfig.experimental.fetchCacheKeyPrefix,
              hasRewrites,
              // TODO: Implement
              middlewareMatchers: undefined,
            }),
          })
        }

        hotReloader.activeWebpackConfigs?.forEach((config, idx) => {
          const isClient = idx === 0
          const isNodeServer = idx === 1
          const isEdgeServer = idx === 2
          const hasRewrites =
            opts.fsChecker.rewrites.afterFiles.length > 0 ||
            opts.fsChecker.rewrites.beforeFiles.length > 0 ||
            opts.fsChecker.rewrites.fallback.length > 0

          if (tsconfigChange) {
            config.resolve?.plugins?.forEach((plugin: any) => {
              // look for the JsConfigPathsPlugin and update with
              // the latest paths/baseUrl config
              if (plugin instanceof JsConfigPathsPlugin && tsconfigResult) {
                const { resolvedBaseUrl, jsConfig } = tsconfigResult
                const currentResolvedBaseUrl = plugin.resolvedBaseUrl
                const resolvedUrlIndex = config.resolve?.modules?.findIndex(
                  (item) => item === currentResolvedBaseUrl?.baseUrl
                )

                if (resolvedBaseUrl) {
                  if (
                    resolvedBaseUrl.baseUrl !== currentResolvedBaseUrl?.baseUrl
                  ) {
                    // remove old baseUrl and add new one
                    if (resolvedUrlIndex && resolvedUrlIndex > -1) {
                      config.resolve?.modules?.splice(resolvedUrlIndex, 1)
                    }

                    // If the resolvedBaseUrl is implicit we only remove the previous value.
                    // Only add the baseUrl if it's explicitly set in tsconfig/jsconfig
                    if (!resolvedBaseUrl.isImplicit) {
                      config.resolve?.modules?.push(resolvedBaseUrl.baseUrl)
                    }
                  }
                }

                if (jsConfig?.compilerOptions?.paths && resolvedBaseUrl) {
                  Object.keys(plugin.paths).forEach((key) => {
                    delete plugin.paths[key]
                  })
                  Object.assign(plugin.paths, jsConfig.compilerOptions.paths)
                  plugin.resolvedBaseUrl = resolvedBaseUrl
                }
              }
            })
          }

          if (envChange) {
            config.plugins?.forEach((plugin: any) => {
              // we look for the DefinePlugin definitions so we can
              // update them on the active compilers
              if (
                plugin &&
                typeof plugin.definitions === 'object' &&
                plugin.definitions.__NEXT_DEFINE_ENV
              ) {
                const newDefine = getDefineEnv({
                  isTurbopack: false,
                  clientRouterFilters,
                  config: nextConfig,
                  dev: true,
                  distDir,
                  fetchCacheKeyPrefix:
                    opts.nextConfig.experimental.fetchCacheKeyPrefix,
                  hasRewrites,
                  isClient,
                  isEdgeServer,
                  isNodeOrEdgeCompilation: isNodeServer || isEdgeServer,
                  isNodeServer,
                  middlewareMatchers: undefined,
                })

                Object.keys(plugin.definitions).forEach((key) => {
                  if (!(key in newDefine)) {
                    delete plugin.definitions[key]
                  }
                })
                Object.assign(plugin.definitions, newDefine)
              }
            })
          }
        })
        await hotReloader.invalidate({
          reloadAfterInvalidation: envChange,
        })
      }

      if (nestedMiddleware.length > 0) {
        Log.error(
          new NestedMiddlewareError(
            nestedMiddleware,
            dir,
            (pagesDir || appDir)!
          ).message
        )
        nestedMiddleware = []
      }

      // Make sure to sort parallel routes to make the result deterministic.
      serverFields.appPathRoutes = Object.fromEntries(
        Object.entries(appPaths).map(([k, v]) => [k, v.sort()])
      )
      await propagateServerField(
        opts,
        'appPathRoutes',
        serverFields.appPathRoutes
      )

      // TODO: pass this to fsChecker/next-dev-server?
      serverFields.middleware = middlewareMatchers
        ? {
            match: null as any,
            page: '/',
            matchers: middlewareMatchers,
          }
        : undefined

      await propagateServerField(opts, 'middleware', serverFields.middleware)
      serverFields.hasAppNotFound = hasRootAppNotFound

      opts.fsChecker.middlewareMatcher = serverFields.middleware?.matchers
        ? getMiddlewareRouteMatcher(serverFields.middleware?.matchers)
        : undefined

      const interceptionRoutes = generateInterceptionRoutesRewrites(
        Object.keys(appPaths),
        opts.nextConfig.basePath
      ).map((item) =>
        buildCustomRoute(
          'before_files_rewrite',
          item,
          opts.nextConfig.basePath,
          opts.nextConfig.experimental.caseSensitiveRoutes
        )
      )

      opts.fsChecker.rewrites.beforeFiles.push(...interceptionRoutes)

      const exportPathMap =
        (typeof nextConfig.exportPathMap === 'function' &&
          (await nextConfig.exportPathMap?.(
            {},
            {
              dev: true,
              dir: opts.dir,
              outDir: null,
              distDir: distDir,
              buildId: 'development',
            }
          ))) ||
        {}

      const exportPathMapEntries = Object.entries(exportPathMap || {})

      if (exportPathMapEntries.length > 0) {
        opts.fsChecker.exportPathMapRoutes = exportPathMapEntries.map(
          ([key, value]) =>
            buildCustomRoute(
              'before_files_rewrite',
              {
                source: key,
                destination: `${value.page}${
                  value.query ? '?' : ''
                }${qs.stringify(value.query)}`,
              },
              opts.nextConfig.basePath,
              opts.nextConfig.experimental.caseSensitiveRoutes
            )
        )
      }

      try {
        // we serve a separate manifest with all pages for the client in
        // dev mode so that we can match a page after a rewrite on the client
        // before it has been built and is populated in the _buildManifest
        const sortedRoutes = getSortedRoutes(routedPages)

        opts.fsChecker.dynamicRoutes = sortedRoutes.map(
          (page): FilesystemDynamicRoute => {
            const regex = getRouteRegex(page)
            return {
              regex: regex.re.toString(),
              match: getRouteMatcher(regex),
              page,
            }
          }
        )

        const dataRoutes: typeof opts.fsChecker.dynamicRoutes = []

        for (const page of sortedRoutes) {
          const route = buildDataRoute(page, 'development')
          const routeRegex = getRouteRegex(route.page)
          dataRoutes.push({
            ...route,
            regex: routeRegex.re.toString(),
            match: getRouteMatcher({
              // TODO: fix this in the manifest itself, must also be fixed in
              // upstream builder that relies on this
              re: opts.nextConfig.i18n
                ? new RegExp(
                    route.dataRouteRegex.replace(
                      `/development/`,
                      `/development/(?<nextLocale>[^/]+?)/`
                    )
                  )
                : new RegExp(route.dataRouteRegex),
              groups: routeRegex.groups,
            }),
          })
        }
        opts.fsChecker.dynamicRoutes.unshift(...dataRoutes)

        if (!prevSortedRoutes?.every((val, idx) => val === sortedRoutes[idx])) {
          const addedRoutes = sortedRoutes.filter(
            (route) => !prevSortedRoutes.includes(route)
          )
          const removedRoutes = prevSortedRoutes.filter(
            (route) => !sortedRoutes.includes(route)
          )

          // emit the change so clients fetch the update
          hotReloader.send({
            action: HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
            data: [
              {
                devPagesManifest: true,
              },
            ],
          })

          addedRoutes.forEach((route) => {
            hotReloader.send({
              action: HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE,
              data: [route],
            })
          })

          removedRoutes.forEach((route) => {
            hotReloader.send({
              action: HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE,
              data: [route],
            })
          })
        }
        prevSortedRoutes = sortedRoutes

        if (!resolved) {
          resolve()
          resolved = true
        }
      } catch (e) {
        if (!resolved) {
          reject(e)
          resolved = true
        } else {
          Log.warn('Failed to reload dynamic routes:', e)
        }
      } finally {
        // Reload the matchers. The filesystem would have been written to,
        // and the matchers need to re-scan it to update the router.
        await propagateServerField(opts, 'reloadMatchers', undefined)
      }
    })

    wp.watch({ directories: [dir], startTime: 0 })
  })

  const clientPagesManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_PAGES_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(clientPagesManifestPath)

  const devMiddlewareManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_MIDDLEWARE_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(devMiddlewareManifestPath)

  async function requestHandler(req: IncomingMessage, res: ServerResponse) {
    const parsedUrl = url.parse(req.url || '/')

    if (parsedUrl.pathname?.includes(clientPagesManifestPath)) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          pages: prevSortedRoutes.filter(
            (route) => !opts.fsChecker.appFiles.has(route)
          ),
        })
      )
      return { finished: true }
    }

    if (parsedUrl.pathname?.includes(devMiddlewareManifestPath)) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(serverFields.middleware?.matchers || []))
      return { finished: true }
    }
    return { finished: false }
  }

  async function logErrorWithOriginalStack(
    err: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ) {
    let usedOriginalStack = false

    if (isError(err) && err.stack) {
      try {
        const frames = parseStack(err.stack!)
        // Filter out internal edge related runtime stack
        const frame = frames.find(
          ({ file }) =>
            !file?.startsWith('eval') &&
            !file?.includes('web/adapter') &&
            !file?.includes('web/globals') &&
            !file?.includes('sandbox/context') &&
            !file?.includes('<anonymous>')
        )

        let originalFrame: OriginalStackFrameResponse | null = null
        let isEdgeCompiler = false
        const frameFile = frame?.file
        if (frame?.lineNumber && frameFile) {
          if (hotReloader.turbopackProject) {
            try {
              originalFrame = await createOriginalTurboStackFrame(
                hotReloader.turbopackProject,
                {
                  file: frameFile,
                  methodName: frame.methodName,
                  line: frame.lineNumber ?? 0,
                  column: frame.column ?? undefined,
                  isServer: true,
                }
              )
            } catch {}
          } else {
            const moduleId = frameFile.replace(
              /^(webpack-internal:\/\/\/|file:\/\/)/,
              ''
            )
            const modulePath = frameFile.replace(
              /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
              ''
            )

            const src = getErrorSource(err as Error)
            isEdgeCompiler = src === COMPILER_NAMES.edgeServer
            const compilation = (
              isEdgeCompiler
                ? hotReloader.edgeServerStats?.compilation
                : hotReloader.serverStats?.compilation
            )!

            const sourceMap = await (frame.file?.startsWith(path.sep) ||
            frame.file?.startsWith('file:')
              ? getSourceMapFromFile(frame.file)
              : getSourceMapFromCompilation(moduleId, compilation))

            if (sourceMap) {
              try {
                originalFrame = await createOriginalStackFrame({
                  source: {
                    type: 'bundle',
                    sourceMap,
                    compilation,
                    ignoredSources: getIgnoredSources(sourceMap),
                    moduleId,
                    modulePath,
                  },
                  frame,
                  rootDirectory: opts.dir,
                  errorMessage: err.message,
                })
              } catch {}
            }
          }

          if (
            originalFrame?.originalCodeFrame &&
            originalFrame.originalStackFrame
          ) {
            const { originalCodeFrame, originalStackFrame } = originalFrame
            const { file, lineNumber, column, methodName } = originalStackFrame

            Log[type === 'warning' ? 'warn' : 'error'](
              `${file} (${lineNumber}:${column}) @ ${methodName}`
            )

            let errorToLog
            if (isEdgeCompiler) {
              errorToLog = err.message
            } else if (isError(err) && hotReloader.turbopackProject) {
              const stack = await traceTurbopackErrorStack(
                hotReloader.turbopackProject,
                err,
                frames
              )

              const error: NextError = new Error(err.message)
              error.stack = stack
              error.digest = err.digest
              errorToLog = error
            } else {
              errorToLog = err
            }

            logError(errorToLog, type)
            console[type === 'warning' ? 'warn' : 'error'](originalCodeFrame)
            usedOriginalStack = true
          }
        }
      } catch (_) {
        // failed to load original stack using source maps
        // this un-actionable by users so we don't show the
        // internal error and only show the provided stack
      }
    }

    if (!usedOriginalStack) {
      logError(err, type)
    }
  }

  return {
    serverFields,
    hotReloader,
    requestHandler,
    logErrorWithOriginalStack,

    async ensureMiddleware(requestUrl?: string) {
      if (!serverFields.actualMiddlewareFile) return
      return hotReloader.ensurePage({
        page: serverFields.actualMiddlewareFile,
        clientOnly: false,
        definition: undefined,
        url: requestUrl,
      })
    },
  }
}

function logError(
  err: unknown,
  type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
) {
  if (err instanceof ModuleBuildError) {
    // Errors that may come from issues from the user's code
    Log.error(err.message)
  } else if (err instanceof TurbopackInternalError) {
    // An internal Turbopack error that has been handled by next-swc, written
    // to disk and a simplified message shown to user on the Rust side.
  } else if (type === 'warning') {
    Log.warn(err)
  } else if (type === 'app-dir') {
    logAppDirError(err)
  } else if (type) {
    Log.error(`${type}:`, err)
  } else {
    Log.error(err)
  }
}

export async function setupDevBundler(opts: SetupOpts) {
  const isSrcDir = path
    .relative(opts.dir, opts.pagesDir || opts.appDir || '')
    .startsWith('src')

  const result = await startWatcher(opts)

  opts.telemetry.record(
    eventCliSession(
      path.join(opts.dir, opts.nextConfig.distDir),
      opts.nextConfig,
      {
        webpackVersion: 5,
        isSrcDir,
        turboFlag: !!opts.turbo,
        cliCommand: 'dev',
        appDir: !!opts.appDir,
        pagesDir: !!opts.pagesDir,
        isCustomServer: !!opts.isCustomServer,
        hasNowJson: !!(await findUp('now.json', { cwd: opts.dir })),
      }
    )
  )
  return result
}

export type DevBundler = Awaited<ReturnType<typeof setupDevBundler>>

// Returns a trace rewritten through Turbopack's sourcemaps
async function traceTurbopackErrorStack(
  project: Project,
  error: Error,
  frames: StackFrame[]
): Promise<string> {
  let originalFrames = await Promise.all(
    frames.map(async (f) => {
      try {
        const traced = await batchedTraceSource(project, {
          file: f.file!,
          methodName: f.methodName,
          line: f.lineNumber ?? 0,
          column: f.column ?? undefined,
          isServer: true,
        })

        return traced?.frame ?? f
      } catch {
        return f
      }
    })
  )

  return (
    error.name +
    ': ' +
    error.message +
    '\n' +
    originalFrames
      .map((f) => {
        if (f == null) {
          return null
        }

        let line = '    at'
        if (f.methodName != null) {
          line += ' ' + f.methodName
        }

        if (f.file != null) {
          const file =
            f.file.startsWith('/') ||
            // Built-in "filenames" like `<anonymous>` shouldn't be made relative
            f.file.startsWith('<') ||
            f.file.startsWith('node:')
              ? f.file
              : `./${f.file}`

          line += ` (${file}`
          if (f.lineNumber != null) {
            line += ':' + f.lineNumber

            if (f.column != null) {
              line += ':' + f.column
            }
          }
          line += ')'
        }

        return line
      })
      .filter(Boolean)
      .join('\n')
  )
}
