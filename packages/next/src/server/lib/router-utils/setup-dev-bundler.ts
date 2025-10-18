import type { NextConfigComplete } from '../../config-shared'
import type { FilesystemDynamicRoute } from './filesystem'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import type { ProxyMatcher } from '../../../build/analysis/get-page-static-info'
import type { RoutesManifest } from '../../../build'
import type { MiddlewareRouteMatch } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { PropagateToWorkersField } from './types'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'

import { createDefineEnv } from '../../../build/swc'
import fs from 'fs'
import url from 'url'
import path from 'path'
import qs from 'querystring'
import Watchpack from 'next/dist/compiled/watchpack'
import findUp from 'next/dist/compiled/find-up'
import { buildCustomRoute } from './filesystem'
import * as Log from '../../../build/output/log'
import { setGlobal } from '../../../trace/shared'
import type { Telemetry } from '../../../telemetry/storage'
import type { IncomingMessage, ServerResponse } from 'http'
import { createValidFileMatcher } from '../find-page-file'
import {
  EVENT_BUILD_FEATURE_USAGE,
  eventCliSession,
} from '../../../telemetry/events'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { sortByPageExts } from '../../../build/sort-by-page-exts'
import { verifyTypeScriptSetup } from '../../../lib/verify-typescript-setup'
import { verifyPartytownSetup } from '../../../lib/verify-partytown-setup'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { buildDataRoute } from './build-data-route'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { createClientRouterFilter } from '../../../lib/create-client-router-filter'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { generateInterceptionRoutesRewrites } from '../../../lib/generate-interception-routes-rewrites'

import {
  CLIENT_STATIC_FILES_PATH,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_CLIENT_MIDDLEWARE_MANIFEST,
  PHASE_DEVELOPMENT_SERVER,
  TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST,
  ROUTES_MANIFEST,
  PRERENDER_MANIFEST,
} from '../../../shared/lib/constants'

import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  isMiddlewareFile,
  NestedMiddlewareError,
  isInstrumentationHookFile,
  getPossibleMiddlewareFilenames,
  getPossibleInstrumentationHookFilenames,
} from '../../../build/utils'
import { devPageFiles } from '../../../build/webpack/plugins/next-types-plugin/shared'
import type { LazyRenderServerInstance } from '../router-server'
import { HMR_MESSAGE_SENT_TO_BROWSER } from '../../dev/hot-reloader-types'
import { PAGE_TYPES } from '../../../lib/page-types'
import { generateEncryptionKeyBase64 } from '../../app-render/encryption-utils-server'
import {
  isMetadataRouteFile,
  isStaticMetadataFile,
} from '../../../lib/metadata/is-metadata-route'
import { normalizeMetadataPageToRoute } from '../../../lib/metadata/get-metadata-route'
import { JsConfigPathsPlugin } from '../../../build/webpack/plugins/jsconfig-paths-plugin'
import { store as consoleStore } from '../../../build/output/store'
import {
  isFileSystemCacheEnabledForDev,
  ModuleBuildError,
} from '../../../shared/lib/turbopack/utils'
import { getDefineEnv } from '../../../build/define-env'
import { TurbopackInternalError } from '../../../shared/lib/turbopack/internal-error'
import { normalizePath } from '../../../lib/normalize-path'
import {
  JSON_CONTENT_TYPE_HEADER,
  MIDDLEWARE_FILENAME,
  PROXY_FILENAME,
} from '../../../lib/constants'
import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
} from './route-types-utils'
import { isParallelRouteSegment } from '../../../shared/lib/segment'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import { Lockfile } from '../../../build/lockfile'

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

export interface DevRoutesManifest {
  version: number
  caseSensitive: RoutesManifest['caseSensitive']
  basePath: RoutesManifest['basePath']
  rewrites: RoutesManifest['rewrites']
  redirects: RoutesManifest['redirects']
  headers: RoutesManifest['headers']
  i18n: RoutesManifest['i18n']
  skipProxyUrlNormalize: RoutesManifest['skipProxyUrlNormalize']
}

export type ServerFields = {
  actualMiddlewareFile?: string | undefined
  actualInstrumentationHookFile?: string | undefined
  appPathRoutes?: Record<string, string | string[]>
  middleware?:
    | {
        page: string
        match: MiddlewareRouteMatch
        matchers?: ProxyMatcher[]
      }
    | undefined
  hasAppNotFound?: boolean
  interceptionRoutes?: ReturnType<
    typeof import('./filesystem').buildCustomRoute
  >[]
  setIsrStatus?: (key: string, value: boolean | undefined) => void
  resetFetch?: () => void
}

async function verifyTypeScript(opts: SetupOpts) {
  const verifyResult = await verifyTypeScriptSetup({
    dir: opts.dir,
    distDir: opts.nextConfig.distDir,
    intentDirs: [opts.pagesDir, opts.appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    tsconfigPath: opts.nextConfig.typescript.tsconfigPath,
    disableStaticImages: opts.nextConfig.images.disableStaticImages,
    hasAppDir: !!opts.appDir,
    hasPagesDir: !!opts.pagesDir,
    isolatedDevBuild: opts.nextConfig.experimental.isolatedDevBuild,
  })

  if (verifyResult.version) {
    return true
  }
  return false
}

export async function propagateServerField(
  opts: SetupOpts,
  field: PropagateToWorkersField,
  args: any
) {
  await opts.renderServer?.instance?.propagateServerField(opts.dir, field, args)
}

async function startWatcher(
  opts: SetupOpts & {
    isSrcDir: boolean
  }
) {
  const { nextConfig, appDir, pagesDir, dir, resetFetch } = opts
  const { useFileSystemPublicRoutes } = nextConfig

  const distDir = path.join(opts.dir, opts.nextConfig.distDir)

  setGlobal('distDir', distDir)
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

  let lockfile
  if (opts.nextConfig.experimental.lockDistDir) {
    fs.mkdirSync(distDir, { recursive: true })
    lockfile = await Lockfile.acquireWithRetriesOrExit(
      path.join(distDir, 'lock'),
      'next dev'
    )
  }

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
    ? await (async () => {
        const createHotReloaderTurbopack = (
          require('../../dev/hot-reloader-turbopack') as typeof import('../../dev/hot-reloader-turbopack')
        ).createHotReloaderTurbopack
        return await createHotReloaderTurbopack(
          opts,
          serverFields,
          distDir,
          resetFetch,
          lockfile
        )
      })()
    : await (async () => {
        const HotReloaderWebpack = (
          require('../../dev/hot-reloader-webpack') as typeof import('../../dev/hot-reloader-webpack')
        ).default
        return new HotReloaderWebpack(opts.dir, {
          isSrcDir: opts.isSrcDir,
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
          lockfile,
          onDevServerCleanup: opts.onDevServerCleanup,
        })
      })()

  await hotReloader.start()

  // have to write this after starting hot-reloader since that
  // cleans the dist dir
  const distTypesDir = path.join(distDir, 'types')
  await writeRouteTypesManifest(
    {
      appRoutes: {},
      pageRoutes: {},
      layoutRoutes: {},
      appRouteHandlerRoutes: {},
      redirectRoutes: {},
      rewriteRoutes: {},
      appPagePaths: new Set(),
      pagesRouterPagePaths: new Set(),
      layoutPaths: new Set(),
      appRouteHandlers: new Set(),
      pageApiRoutes: new Set(),
      filePathToRoute: new Map(),
    },
    path.join(distTypesDir, 'routes.d.ts'),
    opts.nextConfig
  )

  const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
  const routesManifest: DevRoutesManifest = {
    version: 3,
    caseSensitive: !!nextConfig.experimental.caseSensitiveRoutes,
    basePath: nextConfig.basePath,
    rewrites: opts.fsChecker.rewrites,
    redirects: opts.fsChecker.redirects,
    headers: opts.fsChecker.headers,
    i18n: nextConfig.i18n || undefined,
    skipProxyUrlNormalize: nextConfig.skipProxyUrlNormalize,
  }
  await fs.promises.writeFile(
    routesManifestPath,
    JSON.stringify(routesManifest)
  )

  const prerenderManifestPath = path.join(distDir, PRERENDER_MANIFEST)
  await fs.promises.writeFile(
    prerenderManifestPath,
    JSON.stringify(opts.fsChecker.prerenderManifest, null, 2)
  )

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
      // Watchpack default is 200ms which adds 200ms of dead time on bootup.
      aggregateTimeout: 5, // Matches webpack-config.ts.
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
    let enabledTypeScript = await verifyTypeScript(opts)
    let previousClientRouterFilters: any
    let previousConflictingPagePaths: Set<string> = new Set()

    const routeTypesFilePath = path.join(distDir, 'types', 'routes.d.ts')
    const validatorFilePath = path.join(distDir, 'types', 'validator.ts')

    wp.on('aggregated', async () => {
      let writeEnvDefinitions = false
      let typescriptStatusFromLastAggregation = enabledTypeScript
      let middlewareMatchers: ProxyMatcher[] | undefined
      const routedPages: string[] = []
      const knownFiles = wp.getTimeInfoEntries()
      const appPaths: Record<string, string[]> = {}
      const pageNameSet = new Set<string>()
      const conflictingAppPagePaths = new Set<string>()
      const appPageFilePaths = new Map<string, string>()
      const pagesPageFilePaths = new Map<string, string>()
      const appRouteHandlers: Array<{ route: string; filePath: string }> = []
      const pageApiRoutes: Array<{ route: string; filePath: string }> = []

      const pageRoutes: Array<{ route: string; filePath: string }> = []
      const appRoutes: Array<{ route: string; filePath: string }> = []
      const layoutRoutes: Array<{ route: string; filePath: string }> = []
      const slots: Array<{ name: string; parent: string }> = []

      let envChange = false
      let tsconfigChange = false
      let conflictingPageChange = 0
      let hasRootAppNotFound = false

      const { appFiles, pageFiles, staticMetadataFiles } = opts.fsChecker

      appFiles.clear()
      pageFiles.clear()
      staticMetadataFiles.clear()
      devPageFiles.clear()

      const sortedKnownFiles: string[] = [...knownFiles.keys()].sort(
        sortByPageExts(nextConfig.pageExtensions)
      )

      let proxyFilePath: string | undefined
      let middlewareFilePath: string | undefined

      for (const fileName of sortedKnownFiles) {
        if (
          !files.includes(fileName) &&
          !directories.some((d) => fileName.startsWith(d))
        ) {
          continue
        }

        const { name: fileBaseName, dir: fileDir } = path.parse(fileName)

        const isAtConventionLevel =
          fileDir === dir || fileDir === path.join(dir, 'src')

        if (isAtConventionLevel && fileBaseName === MIDDLEWARE_FILENAME) {
          middlewareFilePath = fileName
        }
        if (isAtConventionLevel && fileBaseName === PROXY_FILENAME) {
          proxyFilePath = fileName
        }

        if (middlewareFilePath) {
          if (proxyFilePath) {
            const cwd = process.cwd()

            throw new Error(
              `Both ${MIDDLEWARE_FILENAME} file "./${path.relative(cwd, middlewareFilePath)}" and ${PROXY_FILENAME} file "./${path.relative(cwd, proxyFilePath)}" are detected. Please use "./${path.relative(cwd, proxyFilePath)}" only. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
            )
          }
          Log.warnOnce(
            `The "${MIDDLEWARE_FILENAME}" file convention is deprecated. Please use "${PROXY_FILENAME}" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
          )
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
          const getStaticInfoIncludingLayouts = (
            require('../../../build/get-static-info-including-layouts') as typeof import('../../../build/get-static-info-including-layouts')
          ).getStaticInfoIncludingLayouts
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
            { regexp: '^/.*$', originalSource: '/:path*' },
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
          const getPageStaticInfo = (
            require('../../../build/analysis/get-page-static-info') as typeof import('../../../build/analysis/get-page-static-info')
          ).getPageStaticInfo
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

          // Ignore files/directories starting with `_` in the app directory
          if (normalizePathSep(pageName).includes('/_')) {
            continue
          }

          // Record parallel route slots for layout typing
          // May run multiple times (e.g. if a parallel route
          // has both a layout and a page, and children) but that's fine
          const segments = normalizePathSep(pageName).split('/')
          for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i]
            if (isParallelRouteSegment(segment)) {
              const parentPath = normalizeAppPath(
                segments.slice(0, i).join('/')
              )

              const slotName = segment.slice(1)
              // check if the slot already exists
              if (
                slots.some(
                  (s) => s.name === slotName && s.parent === parentPath
                )
              )
                continue

              slots.push({
                name: slotName,
                parent: parentPath,
              })
              break
            }
          }

          // Record layouts
          if (validFileMatcher.isAppLayoutPage(fileName)) {
            layoutRoutes.push({
              route: ensureLeadingSlash(
                normalizeAppPath(normalizePathSep(pageName)).replace(
                  /\/layout$/,
                  ''
                )
              ),
              filePath: fileName,
            })
          }

          if (!validFileMatcher.isAppRouterPage(fileName)) {
            continue
          }

          const originalPageName = pageName
          pageName = normalizeAppPath(pageName).replace(/%5F/g, '_')
          if (!appPaths[pageName]) {
            appPaths[pageName] = []
          }
          appPaths[pageName].push(
            opts.turbo
              ? // Turbopack outputs the correct path which is normalized with the `_`.
                originalPageName.replace(/%5F/g, '_')
              : originalPageName
          )

          if (useFileSystemPublicRoutes) {
            // Static metadata files will be served from filesystem.
            if (appDir && isStaticMetadataFile(fileName.replace(appDir, ''))) {
              staticMetadataFiles.set(pageName, fileName)
            } else {
              appFiles.add(pageName)
            }
          }

          if (validFileMatcher.isAppRouterRoute(fileName)) {
            appRouteHandlers.push({
              route: normalizePathSep(pageName),
              filePath: fileName,
            })
          } else {
            appRoutes.push({
              route: normalizePathSep(pageName),
              filePath: fileName,
            })
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

          if (pageName.startsWith('/api/')) {
            pageApiRoutes.push({
              route: normalizePathSep(pageName),
              filePath: fileName,
            })
          } else {
            pageRoutes.push({
              route: normalizePathSep(pageName),
              filePath: fileName,
            })
          }
        }

        // Record pages
        if (isAppPath) {
          appPageFilePaths.set(pageName, fileName)
        } else {
          pagesPageFilePaths.set(pageName, fileName)
        }

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

      if (envChange || tsconfigChange) {
        if (envChange) {
          writeEnvDefinitions = true

          await propagateServerField(opts, 'loadEnvConfig', [
            { dev: true, forceReload: true },
          ])
        }

        if (hotReloader.turbopackProject) {
          const hasRewrites =
            opts.fsChecker.rewrites.afterFiles.length > 0 ||
            opts.fsChecker.rewrites.beforeFiles.length > 0 ||
            opts.fsChecker.rewrites.fallback.length > 0

          const rootPath =
            opts.nextConfig.turbopack?.root ||
            opts.nextConfig.outputFileTracingRoot ||
            opts.dir
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
              projectPath: opts.dir,
              rewrites: opts.fsChecker.rewrites,
            }),
            rootPath,
            projectPath: normalizePath(path.relative(rootPath, dir)),
          })
        } else {
          let tsconfigResult:
            | UnwrapPromise<
                ReturnType<
                  typeof import('../../../build/load-jsconfig').default
                >
              >
            | undefined
          // This is not relevant for Turbopack because tsconfig/jsconfig is handled internally.
          if (tsconfigChange) {
            try {
              const loadJsConfig = (
                require('../../../build/load-jsconfig') as typeof import('../../../build/load-jsconfig')
              ).default
              tsconfigResult = await loadJsConfig(dir, nextConfig)
            } catch (_) {
              /* do we want to log if there are syntax errors in tsconfig while editing? */
            }
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
                      resolvedBaseUrl.baseUrl !==
                      currentResolvedBaseUrl?.baseUrl
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
                    isNodeServer,
                    middlewareMatchers: undefined,
                    projectPath: opts.dir,
                    rewrites: opts.fsChecker.rewrites,
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
        }
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
            const regex = getNamedRouteRegex(page, {
              prefixRouteKeys: true,
            })
            return {
              regex: regex.re.toString(),
              namedRegex: regex.namedRegex,
              routeKeys: regex.routeKeys,
              match: getRouteMatcher(regex),
              page,
            }
          }
        )

        const dataRoutes: typeof opts.fsChecker.dynamicRoutes = []

        for (const page of sortedRoutes) {
          const route = buildDataRoute(page, 'development')
          const routeRegex = getNamedRouteRegex(route.page, {
            prefixRouteKeys: true,
          })
          dataRoutes.push({
            ...route,
            regex: routeRegex.re.toString(),
            namedRegex: routeRegex.namedRegex,
            routeKeys: routeRegex.routeKeys,
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

        // For Turbopack ADDED_PAGE and REMOVED_PAGE are implemented in hot-reloader-turbopack.ts
        // in order to avoid a race condition where ADDED_PAGE and REMOVED_PAGE are sent before Turbopack picked up the file change.
        if (!opts.turbo) {
          // Reload the matchers. The filesystem would have been written to,
          // and the matchers need to re-scan it to update the router.
          // Reloading the matchers should happen before `ADDED_PAGE` or `REMOVED_PAGE` is sent over the websocket
          // otherwise it sends the event too early.
          await propagateServerField(opts, 'reloadMatchers', undefined)

          if (
            !prevSortedRoutes?.every((val, idx) => val === sortedRoutes[idx])
          ) {
            const addedRoutes = sortedRoutes.filter(
              (route) => !prevSortedRoutes.includes(route)
            )
            const removedRoutes = prevSortedRoutes.filter(
              (route) => !sortedRoutes.includes(route)
            )

            // emit the change so clients fetch the update
            hotReloader.send({
              type: HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
              data: [
                {
                  devPagesManifest: true,
                },
              ],
            })

            addedRoutes.forEach((route) => {
              hotReloader.send({
                type: HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE,
                data: [route],
              })
            })

            removedRoutes.forEach((route) => {
              hotReloader.send({
                type: HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE,
                data: [route],
              })
            })
          }
        }
        prevSortedRoutes = sortedRoutes

        if (enabledTypeScript) {
          // Using === false to make the check clearer.
          if (typescriptStatusFromLastAggregation === false) {
            // we tolerate the error here as this is best effort
            // and the manual install command will be shown
            await verifyTypeScript(opts)
              .then(() => {
                tsconfigChange = true
              })
              .catch(() => {})
          }

          if (writeEnvDefinitions && nextConfig.experimental?.typedEnv) {
            // TODO: The call to propagateServerField 'loadEnvConfig' causes the env to be loaded twice on env file changes.
            const loadEnvConfig = (
              require('@next/env') as typeof import('@next/env')
            ).loadEnvConfig
            const { loadedEnvFiles } = loadEnvConfig(
              dir,
              process.env.NODE_ENV === 'development',
              // Silent as it's the second time `loadEnvConfig` is called in this pass.
              undefined,
              true
            )

            const createEnvDefinitions = (
              require('../experimental/create-env-definitions') as typeof import('../experimental/create-env-definitions')
            ).createEnvDefinitions
            await createEnvDefinitions({
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

          const routeTypesManifest = await createRouteTypesManifest({
            dir,
            pageRoutes,
            appRoutes,
            layoutRoutes,
            slots,
            redirects: opts.nextConfig.redirects,
            rewrites: opts.nextConfig.rewrites,
            // Ensure relative paths in validator.ts are computed from validatorFilePath,
            // matching behavior of build and CLI typegen.
            validatorFilePath,
            appRouteHandlers,
            pageApiRoutes,
          })

          await writeRouteTypesManifest(
            routeTypesManifest,
            routeTypesFilePath,
            opts.nextConfig
          )
          await writeValidatorFile(routeTypesManifest, validatorFilePath)
        }

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
      }
    })

    wp.watch({ directories: [dir], startTime: 0 })
  })

  const clientPagesManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_PAGES_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(clientPagesManifestPath)

  const devMiddlewareManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_MIDDLEWARE_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(devMiddlewareManifestPath)

  const devTurbopackMiddlewareManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(devTurbopackMiddlewareManifestPath)

  async function requestHandler(req: IncomingMessage, res: ServerResponse) {
    const parsedUrl = url.parse(req.url || '/')

    if (parsedUrl.pathname?.includes(clientPagesManifestPath)) {
      res.statusCode = 200
      res.setHeader('Content-Type', JSON_CONTENT_TYPE_HEADER)
      res.end(
        JSON.stringify({
          pages: prevSortedRoutes.filter(
            (route) => !opts.fsChecker.appFiles.has(route)
          ),
        })
      )
      return { finished: true }
    }

    if (
      parsedUrl.pathname?.includes(devMiddlewareManifestPath) ||
      parsedUrl.pathname?.includes(devTurbopackMiddlewareManifestPath)
    ) {
      res.statusCode = 200
      res.setHeader('Content-Type', JSON_CONTENT_TYPE_HEADER)
      res.end(JSON.stringify(serverFields.middleware?.matchers || []))
      return { finished: true }
    }
    return { finished: false }
  }

  function logErrorWithOriginalStack(
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
      Log.error(err)
    } else if (type) {
      Log.error(`${type}:`, err)
    } else {
      Log.error(err)
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

export async function setupDevBundler(opts: SetupOpts) {
  const isSrcDir = path
    .relative(opts.dir, opts.pagesDir || opts.appDir || '')
    .startsWith('src')

  const result = await startWatcher({
    ...opts,
    isSrcDir,
  })

  opts.telemetry.record(
    eventCliSession(opts.nextConfig, {
      webpackVersion: 5,
      isSrcDir,
      turboFlag: !!opts.turbo,
      cliCommand: 'dev',
      appDir: !!opts.appDir,
      pagesDir: !!opts.pagesDir,
      isCustomServer: !!opts.isCustomServer,
      hasNowJson: !!(await findUp('now.json', { cwd: opts.dir })),
    })
  )

  // Track build features for dev server here:
  opts.telemetry.record({
    eventName: EVENT_BUILD_FEATURE_USAGE,
    payload: {
      featureName: 'turbopackFileSystemCache',
      invocationCount: isFileSystemCacheEnabledForDev(opts.nextConfig) ? 1 : 0,
    },
  })

  return result
}

export type DevBundler = Awaited<ReturnType<typeof setupDevBundler>>

// Returns a trace rewritten through Turbopack's sourcemaps
