import type { NextConfigComplete } from '../../config-shared'

import fs from 'fs'
import url from 'url'
import path from 'path'
import Watchpack from 'watchpack'
import { loadEnvConfig } from '@next/env'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../../../build/output/log'
import HotReloader from '../../dev/hot-reloader'
import { Telemetry } from '../../../telemetry/storage'
import loadJsConfig from '../../../build/load-jsconfig'
import { createValidFileMatcher } from '../find-page-file'
import { eventCliSession } from '../../../telemetry/events'
import { getDefineEnv } from '../../../build/webpack-config'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { getStaticInfoIncludingLayouts } from '../../../build/entries'
import {
  CLIENT_STATIC_FILES_PATH,
  COMPILER_NAMES,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_MIDDLEWARE_MANIFEST,
} from '../../../shared/lib/constants'
import { verifyTypeScriptSetup } from '../../../lib/verifyTypeScriptSetup'
import { verifyPartytownSetup } from '../../../lib/verify-partytown-setup'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { MiddlewareMatcher } from '../../../build/analysis/get-page-static-info'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { createClientRouterFilter } from '../../../lib/create-client-router-filter'
import isError from '../../../lib/is-error'
import { logAppDirError } from '../../dev/log-app-dir-error'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { IncomingMessage, ServerResponse } from 'http'
import { buildDataRoute } from '../../../shared/lib/router/utils/sorted-routes'
import {
  MiddlewareRouteMatch,
  getMiddlewareRouteMatcher,
} from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  isMiddlewareFile,
  NestedMiddlewareError,
  isInstrumentationHookFile,
  getPossibleMiddlewareFilenames,
  getPossibleInstrumentationHookFilenames,
} from '../../../build/worker'
import {
  createOriginalStackFrame,
  getErrorSource,
  getSourceById,
  parseStack,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { generateInterceptionRoutesRewrites } from '../../../lib/generate-interception-routes-rewrites'
import { buildCustomRoute } from './filesystem'

type SetupOpts = {
  dir: string
  appDir?: string
  pagesDir?: string
  telemetry: Telemetry
  isCustomServer?: boolean
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >
  nextConfig: NextConfigComplete
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

async function startWatcher(opts: SetupOpts) {
  const { nextConfig, appDir, pagesDir, dir } = opts
  const usingTypeScript = await verifyTypeScript(opts)

  if (opts.nextConfig.experimental.nextScriptWorkers) {
    await verifyPartytownSetup(
      opts.dir,
      path.join(opts.dir, opts.nextConfig.distDir, CLIENT_STATIC_FILES_PATH)
    )
  }
  const distDir = path.join(opts.dir, opts.nextConfig.distDir)

  const validFileMatcher = createValidFileMatcher(
    nextConfig.pageExtensions,
    appDir
  )

  const hotReloader = new HotReloader(opts.dir, {
    appDir,
    pagesDir,
    distDir: distDir,
    config: opts.nextConfig,
    buildId: 'development',
    telemetry: opts.telemetry,
    rewrites: opts.fsChecker.rewrites,
    previewProps: opts.fsChecker.prerenderManifest.preview,
  })
  const renderWorkers: {
    app?: import('../router-server').RenderWorker
    pages?: import('../router-server').RenderWorker
  } = {}

  await hotReloader.start()

  opts.fsChecker.ensureCallback(async function ensure(item) {
    if (item.type === 'appFile' || item.type === 'pageFile') {
      await hotReloader.ensurePage({
        clientOnly: false,
        page: item.itemPath,
        isApp: item.type === 'appFile',
      })
    }
  })

  let resolved = false
  let prevSortedRoutes: string[] = []

  const serverFields: {
    actualMiddlewareFile?: string | undefined
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
  } = {}

  async function propagateToWorkers(field: string, args: any) {
    await renderWorkers.app?.propagateServerField(field, args)
    await renderWorkers.pages?.propagateServerField(field, args)
  }

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
    ]
    files.push(...tsconfigPaths)

    const wp = new Watchpack({
      ignored: (pathname: string) => {
        return (
          !files.some((file) => file.startsWith(pathname)) &&
          !directories.some(
            (dir) => pathname.startsWith(dir) || dir.startsWith(pathname)
          )
        )
      },
    })

    wp.watch({ directories: [dir], startTime: 0 })
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

      let envChange = false
      let tsconfigChange = false
      let conflictingPageChange = 0
      let hasRootAppNotFound = false

      const { appFiles, pageFiles } = opts.fsChecker

      appFiles.clear()
      pageFiles.clear()

      for (const [fileName, meta] of knownFiles) {
        if (
          !files.includes(fileName) &&
          !directories.some((d) => fileName.startsWith(d))
        ) {
          continue
        }

        const watchTime = fileWatchTimes.get(fileName)
        const watchTimeChange = watchTime && watchTime !== meta?.timestamp
        fileWatchTimes.set(fileName, meta.timestamp)

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
            normalizePathSep(fileName).startsWith(normalizePathSep(appDir))
        )

        const rootFile = absolutePathToPage(fileName, {
          dir: dir,
          extensions: nextConfig.pageExtensions,
          keepIndex: false,
          pagesType: 'root',
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
          await propagateToWorkers(
            'actualMiddlewareFile',
            serverFields.actualMiddlewareFile
          )
          middlewareMatchers = staticInfo.middleware?.matchers || [
            { regexp: '.*', originalSource: '/:path*' },
          ]
          continue
        }
        if (
          isInstrumentationHookFile(rootFile) &&
          nextConfig.experimental.instrumentationHook
        ) {
          let actualInstrumentationHookFile = rootFile
          await propagateToWorkers(
            'actualInstrumentationHookFile',
            actualInstrumentationHookFile
          )
          continue
        }

        if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
          enabledTypeScript = true
        }

        let pageName = absolutePathToPage(fileName, {
          dir: isAppPath ? appDir! : pagesDir!,
          extensions: nextConfig.pageExtensions,
          keepIndex: isAppPath,
          pagesType: isAppPath ? 'app' : 'pages',
        })

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

          if (isRootNotFound) {
            hasRootAppNotFound = true
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
          appFiles.add(pageName)

          if (routedPages.includes(pageName)) {
            continue
          }
        } else {
          // /index is preserved for root folder
          pageName = pageName.replace(/\/index$/, '') || '/'
          pageFiles.add(pageName)
          // always add to nextDataRoutes for now but in future only add
          // entries that actually use getStaticProps/getServerSideProps
          opts.fsChecker.nextDataRoutes.add(pageName)
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
          await propagateToWorkers('matchers.reload', undefined)
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
          loadEnvConfig(dir, true, Log, true)
        }
        let tsconfigResult:
          | UnwrapPromise<ReturnType<typeof loadJsConfig>>
          | undefined

        if (tsconfigChange) {
          try {
            tsconfigResult = await loadJsConfig(dir, nextConfig)
          } catch (_) {
            /* do we want to log if there are syntax errors in tsconfig  while editing? */
          }
        }

        hotReloader.activeConfigs?.forEach((config, idx) => {
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
              if (plugin && plugin.jsConfigPlugin && tsconfigResult) {
                const { resolvedBaseUrl, jsConfig } = tsconfigResult
                const currentResolvedBaseUrl = plugin.resolvedBaseUrl
                const resolvedUrlIndex = config.resolve?.modules?.findIndex(
                  (item) => item === currentResolvedBaseUrl
                )

                if (
                  resolvedBaseUrl &&
                  resolvedBaseUrl !== currentResolvedBaseUrl
                ) {
                  // remove old baseUrl and add new one
                  if (resolvedUrlIndex && resolvedUrlIndex > -1) {
                    config.resolve?.modules?.splice(resolvedUrlIndex, 1)
                  }
                  config.resolve?.modules?.push(resolvedBaseUrl)
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
                  dev: true,
                  config: nextConfig,
                  distDir,
                  isClient,
                  hasRewrites,
                  isNodeServer,
                  isEdgeServer,
                  clientRouterFilters,
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
        hotReloader.invalidate()
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
      await propagateToWorkers('appPathRoutes', serverFields.appPathRoutes)

      // TODO: pass this to fsChecker/next-dev-server?
      serverFields.middleware = middlewareMatchers
        ? {
            match: null as any,
            page: '/',
            matchers: middlewareMatchers,
          }
        : undefined

      serverFields.hasAppNotFound = hasRootAppNotFound

      serverFields.interceptionRoutes = generateInterceptionRoutesRewrites(
        Object.keys(appPaths)
      )?.map((item) =>
        buildCustomRoute(
          'before_files_rewrite',
          item,
          opts.nextConfig.basePath,
          opts.nextConfig.experimental.caseSensitiveRoutes
        )
      )

      await propagateToWorkers('middleware', serverFields.middleware)

      try {
        // we serve a separate manifest with all pages for the client in
        // dev mode so that we can match a page after a rewrite on the client
        // before it has been built and is populated in the _buildManifest
        const sortedRoutes = getSortedRoutes(routedPages)

        opts.fsChecker.dynamicRoutes = sortedRoutes
          .map((page) => {
            const regex = getRouteRegex(page)
            return {
              match: getRouteMatcher(regex),
              page,
              re: regex.re,
              groups: regex.groups,
            }
          })
          .filter(Boolean) as any

        for (const page of sortedRoutes) {
          const route = buildDataRoute(page, 'development')
          const routeRegex = getRouteRegex(route.page)
          opts.fsChecker.dynamicRoutes.push({
            ...route,
            regex: routeRegex.re.toString(),
            match: getRouteMatcher({
              // TODO: fix this in the manifest itself, must also be fixed in
              // upstream builder that relies on this
              re: opts.nextConfig.i18n
                ? new RegExp(
                    route.dataRouteRegex.replace(
                      `/development/`,
                      `/development/(?<nextLocale>.+?)/`
                    )
                  )
                : new RegExp(route.dataRouteRegex),
              groups: routeRegex.groups,
            }),
          })
        }

        if (!prevSortedRoutes?.every((val, idx) => val === sortedRoutes[idx])) {
          // emit the change so clients fetch the update
          hotReloader.send('devPagesManifestUpdate', {
            devPagesManifest: true,
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
        await propagateToWorkers('middleware.reload', undefined)
      }
    })
  })

  opts.fsChecker.middlewareMatcher = serverFields.middleware?.matchers
    ? getMiddlewareRouteMatcher(serverFields.middleware?.matchers)
    : undefined

  const clientPagesManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_PAGES_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(clientPagesManifestPath)

  const devMiddlewareManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_MIDDLEWARE_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(devMiddlewareManifestPath)

  async function requestHandler(req: IncomingMessage, res: ServerResponse) {
    const parsedUrl = url.parse(req.url || '/')

    if (parsedUrl.pathname === clientPagesManifestPath) {
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

    if (parsedUrl.pathname === devMiddlewareManifestPath) {
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

        if (frame?.lineNumber && frame?.file) {
          const moduleId = frame.file!.replace(
            /^(webpack-internal:\/\/\/|file:\/\/)/,
            ''
          )
          const modulePath = frame.file.replace(
            /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
            ''
          )

          const src = getErrorSource(err as Error)
          const isEdgeCompiler = src === COMPILER_NAMES.edgeServer
          const compilation = (
            isEdgeCompiler
              ? hotReloader.edgeServerStats?.compilation
              : hotReloader.serverStats?.compilation
          )!

          const source = await getSourceById(
            !!frame.file?.startsWith(path.sep) ||
              !!frame.file?.startsWith('file:'),
            moduleId,
            compilation
          )

          const originalFrame = await createOriginalStackFrame({
            line: frame.lineNumber,
            column: frame.column,
            source,
            frame,
            moduleId,
            modulePath,
            rootDirectory: opts.dir,
            errorMessage: err.message,
            serverCompilation: isEdgeCompiler
              ? undefined
              : hotReloader.serverStats?.compilation,
            edgeCompilation: isEdgeCompiler
              ? hotReloader.edgeServerStats?.compilation
              : undefined,
          }).catch(() => {})

          if (originalFrame) {
            const { originalCodeFrame, originalStackFrame } = originalFrame
            const { file, lineNumber, column, methodName } = originalStackFrame

            Log[type === 'warning' ? 'warn' : 'error'](
              `${file} (${lineNumber}:${column}) @ ${methodName}`
            )
            if (isEdgeCompiler) {
              err = err.message
            }
            if (type === 'warning') {
              Log.warn(err)
            } else if (type === 'app-dir') {
              logAppDirError(err)
            } else if (type) {
              Log.error(`${type}:`, err)
            } else {
              Log.error(err)
            }
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
      if (type === 'warning') {
        Log.warn(err)
      } else if (type === 'app-dir') {
        logAppDirError(err)
      } else if (type) {
        Log.error(`${type}:`, err)
      } else {
        Log.error(err)
      }
    }
  }

  return {
    serverFields,

    hotReloader,
    renderWorkers,
    requestHandler,
    logErrorWithOriginalStack,

    async ensureMiddleware() {
      if (!serverFields.actualMiddlewareFile) return
      return hotReloader.ensurePage({
        page: serverFields.actualMiddlewareFile,
        clientOnly: false,
      })
    },
  }
}

export async function setupDev(opts: SetupOpts) {
  const isSrcDir = path
    .relative(opts.dir, opts.pagesDir || opts.appDir || '')
    .startsWith('src')

  opts.telemetry.record(
    eventCliSession(
      path.join(opts.dir, opts.nextConfig.distDir),
      opts.nextConfig,
      {
        webpackVersion: 5,
        isSrcDir,
        turboFlag: false,
        cliCommand: 'dev',
        appDir: !!opts.appDir,
        pagesDir: !!opts.pagesDir,
        isCustomServer: !!opts.isCustomServer,
        hasNowJson: !!(await findUp('now.json', { cwd: opts.dir })),
      }
    )
  )
  return await startWatcher(opts)
}
