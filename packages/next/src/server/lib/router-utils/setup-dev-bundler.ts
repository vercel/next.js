import type { NextConfigComplete } from '../../config-shared'
import type {
  Endpoint,
  Route,
  TurbopackResult,
  WrittenEndpoint,
  Issue,
  StyledString,
} from '../../../build/swc'
import type { Socket } from 'net'
import type { FilesystemDynamicRoute } from './filesystem'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import type { MiddlewareMatcher } from '../../../build/analysis/get-page-static-info'
import type { OutputState } from '../../../build/output/store'
import type { MiddlewareRouteMatch } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { BuildManifest } from '../../get-page-files'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import type { AppBuildManifest } from '../../../build/webpack/plugins/app-build-manifest-plugin'
import type { PropagateToWorkersField } from './types'
import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../../build/webpack/plugins/middleware-plugin'
import type {
  CompilationError,
  HMR_ACTION_TYPES,
  NextJsHotReloaderInterface,
  ReloadPageAction,
  SyncAction,
  TurbopackConnectedAction,
} from '../../dev/hot-reloader-types'

import ws from 'next/dist/compiled/ws'
import { createDefineEnv } from '../../../build/swc'
import fs from 'fs'
import url from 'url'
import path from 'path'
import qs from 'querystring'
import Watchpack from 'next/dist/compiled/watchpack'
import { loadEnvConfig } from '@next/env'
import isError from '../../../lib/is-error'
import findUp from 'next/dist/compiled/find-up'
import { buildCustomRoute } from './filesystem'
import * as Log from '../../../build/output/log'
import HotReloaderWebpack, {
  getVersionInfo,
  matchNextPageBundleRequest,
} from '../../dev/hot-reloader-webpack'
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
import { store as consoleStore } from '../../../build/output/store'

import {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  COMPILER_NAMES,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_MIDDLEWARE_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  PHASE_DEVELOPMENT_SERVER,
  SERVER_REFERENCE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
} from '../../../shared/lib/constants'

import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'

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
import {
  getOverlayMiddleware,
  createOriginalStackFrame as createOriginalTurboStackFrame,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware-turbopack'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { PageNotFoundError } from '../../../shared/lib/utils'
import {
  type ClientBuildManifest,
  normalizeRewritesForBuildManifest,
  srcEmptySsgManifest,
} from '../../../build/webpack/plugins/build-manifest-plugin'
import { devPageFiles } from '../../../build/webpack/plugins/next-types-plugin/shared'
import type { LazyRenderServerInstance } from '../router-server'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../dev/hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../../build/swc'
import { debounce } from '../../utils'
import {
  deleteAppClientCache,
  deleteCache,
} from '../../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { normalizeMetadataRoute } from '../../../lib/metadata/get-metadata-route'
import { clearModuleContext } from '../render-server'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
import type { LoadableManifest } from '../../load-components'
import { generateRandomActionKeyRaw } from '../../app-render/action-encryption-utils'
import { bold, green, red } from '../../../lib/picocolors'
import { writeFileAtomic } from '../../../lib/fs/write-atomic'
import { PAGE_TYPES } from '../../../lib/page-types'
import { trace } from '../../../trace'
import type { VersionInfo } from '../../dev/parse-version-info'

const MILLISECONDS_IN_NANOSECOND = 1_000_000
const wsServer = new ws.Server({ noServer: true })
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

type SetupOpts = {
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

class ModuleBuildError extends Error {}

async function startWatcher(opts: SetupOpts) {
  const { nextConfig, appDir, pagesDir, dir } = opts
  const { useFileSystemPublicRoutes } = nextConfig
  const usingTypeScript = await verifyTypeScript(opts)

  const distDir = path.join(opts.dir, opts.nextConfig.distDir)

  setGlobal('distDir', distDir)
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

  const validFileMatcher = createValidFileMatcher(
    nextConfig.pageExtensions,
    appDir
  )

  async function propagateServerField(
    field: PropagateToWorkersField,
    args: any
  ) {
    await opts.renderServer?.instance?.propagateServerField(
      opts.dir,
      field,
      args
    )
  }

  const serverFields: {
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
  } = {}

  async function createHotReloaderTurbopack(): Promise<NextJsHotReloaderInterface> {
    const { loadBindings } =
      require('../../../build/swc') as typeof import('../../../build/swc')

    let bindings = await loadBindings()

    const { jsConfig } = await loadJsConfig(dir, opts.nextConfig)

    // For the debugging purpose, check if createNext or equivalent next instance setup in test cases
    // works correctly. Normally `run-test` hides output so only will be visible when `--debug` flag is used.
    if (process.env.TURBOPACK && isTestMode) {
      require('console').log('Creating turbopack project', {
        dir,
        testMode: isTestMode,
      })
    }

    const hasRewrites =
      opts.fsChecker.rewrites.afterFiles.length > 0 ||
      opts.fsChecker.rewrites.beforeFiles.length > 0 ||
      opts.fsChecker.rewrites.fallback.length > 0

    const hotReloaderSpan = trace('hot-reloader', undefined, {
      version: process.env.__NEXT_VERSION as string,
    })
    // Ensure the hotReloaderSpan is flushed immediately as it's the parentSpan for all processing
    // of the current `next dev` invocation.
    hotReloaderSpan.stop()

    const project = await bindings.turbo.createProject({
      projectPath: dir,
      rootPath: opts.nextConfig.experimental.outputFileTracingRoot || dir,
      nextConfig: opts.nextConfig,
      jsConfig: jsConfig ?? { compilerOptions: {} },
      watch: true,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        allowedRevalidateHeaderKeys: undefined,
        clientRouterFilters: undefined,
        config: nextConfig,
        dev: true,
        distDir,
        fetchCacheKeyPrefix: undefined,
        hasRewrites,
        middlewareMatchers: undefined,
        previewModeId: undefined,
      }),
      serverAddr: `127.0.0.1:${opts.port}`,
    })
    const iter = project.entrypointsSubscribe()
    const curEntries: Map<string, Route> = new Map()
    const changeSubscriptions: Map<
      string,
      Promise<AsyncIterator<any>>
    > = new Map()
    let prevMiddleware: boolean | undefined = undefined
    const globalEntries: {
      app: Endpoint | undefined
      document: Endpoint | undefined
      error: Endpoint | undefined
    } = {
      app: undefined,
      document: undefined,
      error: undefined,
    }
    let currentEntriesHandlingResolve: ((value?: unknown) => void) | undefined
    let currentEntriesHandling = new Promise(
      (resolve) => (currentEntriesHandlingResolve = resolve)
    )
    const hmrPayloads = new Map<string, HMR_ACTION_TYPES>()
    const turbopackUpdates: TurbopackUpdate[] = []

    const issues = new Map<string, Map<string, Issue>>()

    function issueKey(issue: Issue): string {
      return [
        issue.severity,
        issue.filePath,
        JSON.stringify(issue.title),
        JSON.stringify(issue.description),
      ].join('-')
    }

    function formatIssue(issue: Issue) {
      const { filePath, title, description, source } = issue
      let { documentationLink } = issue
      let formattedTitle = renderStyledStringToErrorAnsi(title).replace(
        /\n/g,
        '\n    '
      )

      // TODO: Use error codes to identify these
      // TODO: Generalize adapting Turbopack errors to Next.js errors
      if (formattedTitle.includes('Module not found')) {
        // For compatiblity with webpack
        // TODO: include columns in webpack errors.
        documentationLink = 'https://nextjs.org/docs/messages/module-not-found'
      }

      let formattedFilePath = filePath
        .replace('[project]/', './')
        .replaceAll('/./', '/')
        .replace('\\\\?\\', '')

      let message

      if (source) {
        if (source.range) {
          const { start } = source.range
          message = `${formattedFilePath}:${start.line + 1}:${
            start.column
          }\n${formattedTitle}`
        } else {
          message = formattedFilePath
        }
      } else if (formattedFilePath) {
        message = `${formattedFilePath}\n${formattedTitle}`
      } else {
        message = formattedTitle
      }
      message += '\n'

      if (source?.range && source.source.content) {
        const { start, end } = source.range
        const {
          codeFrameColumns,
        } = require('next/dist/compiled/babel/code-frame')

        message +=
          codeFrameColumns(
            source.source.content,
            {
              start: {
                line: start.line + 1,
                column: start.column + 1,
              },
              end: {
                line: end.line + 1,
                column: end.column + 1,
              },
            },
            { forceColor: true }
          ).trim() + '\n\n'
      }

      if (description) {
        message += renderStyledStringToErrorAnsi(description) + '\n\n'
      }

      // TODO: Include a trace from the issue.

      if (documentationLink) {
        message += documentationLink + '\n\n'
      }

      return message
    }

    function processIssues(
      name: string,
      result: TurbopackResult,
      throwIssue = false
    ) {
      const newIssues = new Map<string, Issue>()
      issues.set(name, newIssues)

      const relevantIssues = new Set()

      for (const issue of result.issues) {
        if (issue.severity !== 'error' && issue.severity !== 'fatal') continue
        const key = issueKey(issue)
        const formatted = formatIssue(issue)
        newIssues.set(key, issue)

        // We show errors in node_modules to the console, but don't throw for them
        if (/(^|\/)node_modules(\/|$)/.test(issue.filePath)) continue
        relevantIssues.add(formatted)
      }

      if (relevantIssues.size && throwIssue) {
        throw new ModuleBuildError([...relevantIssues].join('\n\n'))
      }
    }

    const serverPathState = new Map<string, string>()

    async function processResult(
      id: string,
      result: TurbopackResult<WrittenEndpoint>
    ): Promise<TurbopackResult<WrittenEndpoint>> {
      // Figure out if the server files have changed
      let hasChange = false
      for (const { path: p, contentHash } of result.serverPaths) {
        // We ignore source maps
        if (p.endsWith('.map')) continue
        let key = `${id}:${p}`
        const localHash = serverPathState.get(key)
        const globalHash = serverPathState.get(p)
        if (
          (localHash && localHash !== contentHash) ||
          (globalHash && globalHash !== contentHash)
        ) {
          hasChange = true
          serverPathState.set(key, contentHash)
          serverPathState.set(p, contentHash)
        } else {
          if (!localHash) {
            serverPathState.set(key, contentHash)
          }
          if (!globalHash) {
            serverPathState.set(p, contentHash)
          }
        }
      }

      if (!hasChange) {
        return result
      }

      const hasAppPaths = result.serverPaths.some(({ path: p }) =>
        p.startsWith('server/app')
      )

      if (hasAppPaths) {
        deleteAppClientCache()
      }

      const serverPaths = result.serverPaths.map(({ path: p }) =>
        path.join(distDir, p)
      )

      for (const file of serverPaths) {
        clearModuleContext(file)
        deleteCache(file)
      }

      return result
    }

    const buildingIds = new Set()
    const readyIds = new Set()

    function startBuilding(
      id: string,
      requestUrl: string | undefined,
      forceRebuild: boolean = false
    ) {
      if (!forceRebuild && readyIds.has(id)) {
        return () => {}
      }
      if (buildingIds.size === 0) {
        consoleStore.setState(
          {
            loading: true,
            trigger: id,
            url: requestUrl,
          } as OutputState,
          true
        )
      }
      buildingIds.add(id)
      return function finishBuilding() {
        if (buildingIds.size === 0) {
          return
        }
        readyIds.add(id)
        buildingIds.delete(id)
        if (buildingIds.size === 0) {
          consoleStore.setState(
            {
              loading: false,
            } as OutputState,
            true
          )
        }
      }
    }

    let hmrEventHappened = false
    let hmrHash = 0
    const sendEnqueuedMessages = () => {
      for (const [, issueMap] of issues) {
        if (issueMap.size > 0) {
          // During compilation errors we want to delay the HMR events until errors are fixed
          return
        }
      }
      for (const payload of hmrPayloads.values()) {
        hotReloader.send(payload)
      }
      hmrPayloads.clear()
      if (turbopackUpdates.length > 0) {
        hotReloader.send({
          action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
          data: turbopackUpdates,
        })
        turbopackUpdates.length = 0
      }
    }
    const sendEnqueuedMessagesDebounce = debounce(sendEnqueuedMessages, 2)

    function sendHmr(key: string, id: string, payload: HMR_ACTION_TYPES) {
      hmrPayloads.set(`${key}:${id}`, payload)
      hmrEventHappened = true
      sendEnqueuedMessagesDebounce()
    }

    function sendTurbopackMessage(payload: TurbopackUpdate) {
      turbopackUpdates.push(payload)
      hmrEventHappened = true
      sendEnqueuedMessagesDebounce()
    }

    async function loadPartialManifest<T>(
      name: string,
      pageName: string,
      type:
        | 'pages'
        | 'app'
        | 'app-route'
        | 'middleware'
        | 'instrumentation' = 'pages'
    ): Promise<T> {
      const manifestPath = path.posix.join(
        distDir,
        `server`,
        type === 'app-route' ? 'app' : type,
        type === 'middleware' || type === 'instrumentation'
          ? ''
          : pageName === '/'
          ? 'index'
          : pageName === '/index' || pageName.startsWith('/index/')
          ? `/index${pageName}`
          : pageName,
        type === 'app' ? 'page' : type === 'app-route' ? 'route' : '',
        name
      )
      return JSON.parse(
        await readFile(path.posix.join(manifestPath), 'utf-8')
      ) as T
    }

    type InstrumentationDefinition = {
      files: string[]
      name: 'instrumentation'
    }
    type TurbopackMiddlewareManifest = MiddlewareManifest & {
      instrumentation?: InstrumentationDefinition
    }

    const buildManifests = new Map<string, BuildManifest>()
    const appBuildManifests = new Map<string, AppBuildManifest>()
    const pagesManifests = new Map<string, PagesManifest>()
    const appPathsManifests = new Map<string, PagesManifest>()
    const middlewareManifests = new Map<string, TurbopackMiddlewareManifest>()
    const actionManifests = new Map<string, ActionManifest>()
    const clientToHmrSubscription = new Map<
      ws,
      Map<string, AsyncIterator<any>>
    >()
    const loadbleManifests = new Map<string, LoadableManifest>()
    const clients = new Set<ws>()

    async function loadMiddlewareManifest(
      pageName: string,
      type: 'pages' | 'app' | 'app-route' | 'middleware' | 'instrumentation'
    ): Promise<void> {
      middlewareManifests.set(
        pageName,
        await loadPartialManifest(MIDDLEWARE_MANIFEST, pageName, type)
      )
    }

    async function loadBuildManifest(
      pageName: string,
      type: 'app' | 'pages' = 'pages'
    ): Promise<void> {
      buildManifests.set(
        pageName,
        await loadPartialManifest(BUILD_MANIFEST, pageName, type)
      )
    }

    async function loadAppBuildManifest(pageName: string): Promise<void> {
      appBuildManifests.set(
        pageName,
        await loadPartialManifest(APP_BUILD_MANIFEST, pageName, 'app')
      )
    }

    async function loadPagesManifest(pageName: string): Promise<void> {
      pagesManifests.set(
        pageName,
        await loadPartialManifest(PAGES_MANIFEST, pageName)
      )
    }

    async function loadAppPathManifest(
      pageName: string,
      type: 'app' | 'app-route' = 'app'
    ): Promise<void> {
      appPathsManifests.set(
        pageName,
        await loadPartialManifest(APP_PATHS_MANIFEST, pageName, type)
      )
    }

    async function loadActionManifest(pageName: string): Promise<void> {
      actionManifests.set(
        pageName,
        await loadPartialManifest(
          `${SERVER_REFERENCE_MANIFEST}.json`,
          pageName,
          'app'
        )
      )
    }

    async function loadLoadableManifest(
      pageName: string,
      type: 'app' | 'pages' = 'pages'
    ): Promise<void> {
      loadbleManifests.set(
        pageName,
        await loadPartialManifest(REACT_LOADABLE_MANIFEST, pageName, type)
      )
    }

    async function changeSubscription(
      page: string,
      type: 'client' | 'server',
      includeIssues: boolean,
      endpoint: Endpoint | undefined,
      makePayload: (
        page: string,
        change: TurbopackResult
      ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
    ) {
      const key = `${page} (${type})`
      if (!endpoint || changeSubscriptions.has(key)) return

      const changedPromise = endpoint[`${type}Changed`](includeIssues)
      changeSubscriptions.set(key, changedPromise)
      const changed = await changedPromise

      for await (const change of changed) {
        processIssues(page, change)
        const payload = await makePayload(page, change)
        if (payload) {
          sendHmr('endpoint-change', key, payload)
        }
      }
    }

    async function clearChangeSubscription(
      page: string,
      type: 'server' | 'client'
    ) {
      const key = `${page} (${type})`
      const subscription = await changeSubscriptions.get(key)
      if (subscription) {
        subscription.return?.()
        changeSubscriptions.delete(key)
      }
      issues.delete(key)
    }

    function mergeBuildManifests(manifests: Iterable<BuildManifest>) {
      const manifest: Partial<BuildManifest> & Pick<BuildManifest, 'pages'> = {
        pages: {
          '/_app': [],
        },
        // Something in next.js depends on these to exist even for app dir rendering
        devFiles: [],
        ampDevFiles: [],
        polyfillFiles: [],
        lowPriorityFiles: [
          'static/development/_ssgManifest.js',
          'static/development/_buildManifest.js',
        ],
        rootMainFiles: [],
        ampFirstPages: [],
      }
      for (const m of manifests) {
        Object.assign(manifest.pages, m.pages)
        if (m.rootMainFiles.length) manifest.rootMainFiles = m.rootMainFiles
      }
      return manifest
    }

    function mergeAppBuildManifests(manifests: Iterable<AppBuildManifest>) {
      const manifest: AppBuildManifest = {
        pages: {},
      }
      for (const m of manifests) {
        Object.assign(manifest.pages, m.pages)
      }
      return manifest
    }

    function mergePagesManifests(manifests: Iterable<PagesManifest>) {
      const manifest: PagesManifest = {}
      for (const m of manifests) {
        Object.assign(manifest, m)
      }
      return manifest
    }

    function mergeMiddlewareManifests(
      manifests: Iterable<TurbopackMiddlewareManifest>
    ): MiddlewareManifest {
      const manifest: MiddlewareManifest = {
        version: 2,
        middleware: {},
        sortedMiddleware: [],
        functions: {},
      }
      let instrumentation: InstrumentationDefinition | undefined = undefined
      for (const m of manifests) {
        Object.assign(manifest.functions, m.functions)
        Object.assign(manifest.middleware, m.middleware)
        if (m.instrumentation) {
          instrumentation = m.instrumentation
        }
      }
      const updateFunctionDefinition = (
        fun: EdgeFunctionDefinition
      ): EdgeFunctionDefinition => {
        return {
          ...fun,
          files: [...(instrumentation?.files ?? []), ...fun.files],
        }
      }
      for (const key of Object.keys(manifest.middleware)) {
        const value = manifest.middleware[key]
        manifest.middleware[key] = updateFunctionDefinition(value)
      }
      for (const key of Object.keys(manifest.functions)) {
        const value = manifest.functions[key]
        manifest.functions[key] = updateFunctionDefinition(value)
      }
      for (const fun of Object.values(manifest.functions).concat(
        Object.values(manifest.middleware)
      )) {
        for (const matcher of fun.matchers) {
          if (!matcher.regexp) {
            matcher.regexp = pathToRegexp(matcher.originalSource, [], {
              delimiter: '/',
              sensitive: false,
              strict: true,
            }).source.replaceAll('\\/', '/')
          }
        }
      }
      manifest.sortedMiddleware = Object.keys(manifest.middleware)

      return manifest
    }

    async function mergeActionManifests(manifests: Iterable<ActionManifest>) {
      type ActionEntries = ActionManifest['edge' | 'node']
      const manifest: ActionManifest = {
        node: {},
        edge: {},
        encryptionKey: await generateRandomActionKeyRaw(true),
      }

      function mergeActionIds(
        actionEntries: ActionEntries,
        other: ActionEntries
      ): void {
        for (const key in other) {
          const action = (actionEntries[key] ??= {
            workers: {},
            layer: {},
          })
          Object.assign(action.workers, other[key].workers)
          Object.assign(action.layer, other[key].layer)
        }
      }

      for (const m of manifests) {
        mergeActionIds(manifest.node, m.node)
        mergeActionIds(manifest.edge, m.edge)
      }

      return manifest
    }

    function mergeLoadableManifests(manifests: Iterable<LoadableManifest>) {
      const manifest: LoadableManifest = {}
      for (const m of manifests) {
        Object.assign(manifest, m)
      }
      return manifest
    }

    async function writeBuildManifest(
      rewrites: SetupOpts['fsChecker']['rewrites']
    ): Promise<void> {
      const buildManifest = mergeBuildManifests(buildManifests.values())
      const buildManifestPath = path.join(distDir, BUILD_MANIFEST)
      const middlewareBuildManifestPath = path.join(
        distDir,
        'server',
        `${MIDDLEWARE_BUILD_MANIFEST}.js`
      )
      deleteCache(buildManifestPath)
      deleteCache(middlewareBuildManifestPath)
      await writeFileAtomic(
        buildManifestPath,
        JSON.stringify(buildManifest, null, 2)
      )
      await writeFileAtomic(
        middlewareBuildManifestPath,
        `self.__BUILD_MANIFEST=${JSON.stringify(buildManifest)}`
      )

      const content: ClientBuildManifest = {
        __rewrites: rewrites
          ? (normalizeRewritesForBuildManifest(rewrites) as any)
          : { afterFiles: [], beforeFiles: [], fallback: [] },
        ...Object.fromEntries(
          [...curEntries.keys()].map((pathname) => [
            pathname,
            `static/chunks/pages${pathname === '/' ? '/index' : pathname}.js`,
          ])
        ),
        sortedPages: [...curEntries.keys()],
      }
      const buildManifestJs = `self.__BUILD_MANIFEST = ${JSON.stringify(
        content
      )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
      await writeFileAtomic(
        path.join(distDir, 'static', 'development', '_buildManifest.js'),
        buildManifestJs
      )
      await writeFileAtomic(
        path.join(distDir, 'static', 'development', '_ssgManifest.js'),
        srcEmptySsgManifest
      )
    }

    async function writeFallbackBuildManifest(): Promise<void> {
      const fallbackBuildManifest = mergeBuildManifests(
        [buildManifests.get('_app'), buildManifests.get('_error')].filter(
          Boolean
        ) as BuildManifest[]
      )
      const fallbackBuildManifestPath = path.join(
        distDir,
        `fallback-${BUILD_MANIFEST}`
      )
      deleteCache(fallbackBuildManifestPath)
      await writeFileAtomic(
        fallbackBuildManifestPath,
        JSON.stringify(fallbackBuildManifest, null, 2)
      )
    }

    async function writeAppBuildManifest(): Promise<void> {
      const appBuildManifest = mergeAppBuildManifests(
        appBuildManifests.values()
      )
      const appBuildManifestPath = path.join(distDir, APP_BUILD_MANIFEST)
      deleteCache(appBuildManifestPath)
      await writeFileAtomic(
        appBuildManifestPath,
        JSON.stringify(appBuildManifest, null, 2)
      )
    }

    async function writePagesManifest(): Promise<void> {
      const pagesManifest = mergePagesManifests(pagesManifests.values())
      const pagesManifestPath = path.join(distDir, 'server', PAGES_MANIFEST)
      deleteCache(pagesManifestPath)
      await writeFileAtomic(
        pagesManifestPath,
        JSON.stringify(pagesManifest, null, 2)
      )
    }

    async function writeAppPathsManifest(): Promise<void> {
      const appPathsManifest = mergePagesManifests(appPathsManifests.values())
      const appPathsManifestPath = path.join(
        distDir,
        'server',
        APP_PATHS_MANIFEST
      )
      deleteCache(appPathsManifestPath)
      await writeFileAtomic(
        appPathsManifestPath,
        JSON.stringify(appPathsManifest, null, 2)
      )
    }

    async function writeMiddlewareManifest(): Promise<void> {
      const middlewareManifest = mergeMiddlewareManifests(
        middlewareManifests.values()
      )
      const middlewareManifestPath = path.join(
        distDir,
        'server',
        MIDDLEWARE_MANIFEST
      )
      deleteCache(middlewareManifestPath)
      await writeFileAtomic(
        middlewareManifestPath,
        JSON.stringify(middlewareManifest, null, 2)
      )
    }

    async function writeActionManifest(): Promise<void> {
      const actionManifest = await mergeActionManifests(
        actionManifests.values()
      )
      const actionManifestJsonPath = path.join(
        distDir,
        'server',
        `${SERVER_REFERENCE_MANIFEST}.json`
      )
      const actionManifestJsPath = path.join(
        distDir,
        'server',
        `${SERVER_REFERENCE_MANIFEST}.js`
      )
      const json = JSON.stringify(actionManifest, null, 2)
      deleteCache(actionManifestJsonPath)
      deleteCache(actionManifestJsPath)
      await writeFile(actionManifestJsonPath, json, 'utf-8')
      await writeFile(
        actionManifestJsPath,
        `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`,
        'utf-8'
      )
    }

    async function writeFontManifest(): Promise<void> {
      // TODO: turbopack should write the correct
      // version of this
      const fontManifest = {
        pages: {},
        app: {},
        appUsingSizeAdjust: false,
        pagesUsingSizeAdjust: false,
      }

      const json = JSON.stringify(fontManifest, null, 2)
      const fontManifestJsonPath = path.join(
        distDir,
        'server',
        `${NEXT_FONT_MANIFEST}.json`
      )
      const fontManifestJsPath = path.join(
        distDir,
        'server',
        `${NEXT_FONT_MANIFEST}.js`
      )
      deleteCache(fontManifestJsonPath)
      deleteCache(fontManifestJsPath)
      await writeFileAtomic(fontManifestJsonPath, json)
      await writeFileAtomic(
        fontManifestJsPath,
        `self.__NEXT_FONT_MANIFEST=${JSON.stringify(json)}`
      )
    }

    async function writeLoadableManifest(): Promise<void> {
      const loadableManifest = mergeLoadableManifests(loadbleManifests.values())
      const loadableManifestPath = path.join(distDir, REACT_LOADABLE_MANIFEST)
      const middlewareloadableManifestPath = path.join(
        distDir,
        'server',
        `${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`
      )

      const json = JSON.stringify(loadableManifest, null, 2)

      deleteCache(loadableManifestPath)
      deleteCache(middlewareloadableManifestPath)
      await writeFileAtomic(loadableManifestPath, json)
      await writeFileAtomic(
        middlewareloadableManifestPath,
        `self.__REACT_LOADABLE_MANIFEST=${JSON.stringify(json)}`
      )
    }

    async function writeManifests(): Promise<void> {
      await writeBuildManifest(opts.fsChecker.rewrites)
      await writeAppBuildManifest()
      await writePagesManifest()
      await writeAppPathsManifest()
      await writeMiddlewareManifest()
      await writeActionManifest()
      await writeFontManifest()
      await writeLoadableManifest()
      await writeFallbackBuildManifest()
    }

    async function subscribeToHmrEvents(id: string, client: ws) {
      let mapping = clientToHmrSubscription.get(client)
      if (mapping === undefined) {
        mapping = new Map()
        clientToHmrSubscription.set(client, mapping)
      }
      if (mapping.has(id)) return

      const subscription = project!.hmrEvents(id)
      mapping.set(id, subscription)

      // The subscription will always emit once, which is the initial
      // computation. This is not a change, so swallow it.
      try {
        await subscription.next()

        for await (const data of subscription) {
          processIssues(id, data)
          sendTurbopackMessage(data)
        }
      } catch (e) {
        // The client might be using an HMR session from a previous server, tell them
        // to fully reload the page to resolve the issue. We can't use
        // `hotReloader.send` since that would force very connected client to
        // reload, only this client is out of date.
        const reloadAction: ReloadPageAction = {
          action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE,
        }
        client.send(JSON.stringify(reloadAction))
        client.close()
        return
      }
    }

    function unsubscribeToHmrEvents(id: string, client: ws) {
      const mapping = clientToHmrSubscription.get(client)
      const subscription = mapping?.get(id)
      subscription?.return!()
    }

    try {
      async function handleEntries() {
        for await (const entrypoints of iter) {
          if (!currentEntriesHandlingResolve) {
            currentEntriesHandling = new Promise(
              // eslint-disable-next-line no-loop-func
              (resolve) => (currentEntriesHandlingResolve = resolve)
            )
          }
          globalEntries.app = entrypoints.pagesAppEndpoint
          globalEntries.document = entrypoints.pagesDocumentEndpoint
          globalEntries.error = entrypoints.pagesErrorEndpoint

          curEntries.clear()

          for (const [pathname, route] of entrypoints.routes) {
            switch (route.type) {
              case 'page':
              case 'page-api':
              case 'app-page':
              case 'app-route': {
                curEntries.set(pathname, route)
                break
              }
              default:
                Log.info(`skipping ${pathname} (${route.type})`)
                break
            }
          }

          for (const [pathname, subscriptionPromise] of changeSubscriptions) {
            if (pathname === '') {
              // middleware is handled below
              continue
            }

            if (!curEntries.has(pathname)) {
              const subscription = await subscriptionPromise
              subscription.return?.()
              changeSubscriptions.delete(pathname)
            }
          }

          const { middleware, instrumentation } = entrypoints
          // We check for explicit true/false, since it's initialized to
          // undefined during the first loop (middlewareChanges event is
          // unnecessary during the first serve)
          if (prevMiddleware === true && !middleware) {
            // Went from middleware to no middleware
            await clearChangeSubscription('middleware', 'server')
            sendHmr('entrypoint-change', 'middleware', {
              event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
            })
          } else if (prevMiddleware === false && middleware) {
            // Went from no middleware to middleware
            sendHmr('endpoint-change', 'middleware', {
              event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
            })
          }
          if (
            opts.nextConfig.experimental.instrumentationHook &&
            instrumentation
          ) {
            const processInstrumentation = async (
              displayName: string,
              name: string,
              prop: 'nodeJs' | 'edge'
            ) => {
              const writtenEndpoint = await processResult(
                displayName,
                await instrumentation[prop].writeToDisk()
              )
              processIssues(name, writtenEndpoint)
            }
            await processInstrumentation(
              'instrumentation (node.js)',
              'instrumentation.nodeJs',
              'nodeJs'
            )
            await processInstrumentation(
              'instrumentation (edge)',
              'instrumentation.edge',
              'edge'
            )
            await loadMiddlewareManifest('instrumentation', 'instrumentation')
            await writeManifests()

            serverFields.actualInstrumentationHookFile = '/instrumentation'
            await propagateServerField(
              'actualInstrumentationHookFile',
              serverFields.actualInstrumentationHookFile
            )
          } else {
            serverFields.actualInstrumentationHookFile = undefined
            await propagateServerField(
              'actualInstrumentationHookFile',
              serverFields.actualInstrumentationHookFile
            )
          }
          if (middleware) {
            const processMiddleware = async () => {
              const writtenEndpoint = await processResult(
                'middleware',
                await middleware.endpoint.writeToDisk()
              )
              processIssues('middleware', writtenEndpoint)
              await loadMiddlewareManifest('middleware', 'middleware')
              serverFields.middleware = {
                match: null as any,
                page: '/',
                matchers:
                  middlewareManifests.get('middleware')?.middleware['/']
                    .matchers,
              }
            }
            await processMiddleware()

            changeSubscription(
              'middleware',
              'server',
              false,
              middleware.endpoint,
              async () => {
                const finishBuilding = startBuilding(
                  'middleware',
                  undefined,
                  true
                )
                await processMiddleware()
                await propagateServerField(
                  'actualMiddlewareFile',
                  serverFields.actualMiddlewareFile
                )
                await propagateServerField(
                  'middleware',
                  serverFields.middleware
                )
                await writeManifests()

                finishBuilding()
                return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
              }
            )
            prevMiddleware = true
          } else {
            middlewareManifests.delete('middleware')
            serverFields.actualMiddlewareFile = undefined
            serverFields.middleware = undefined
            prevMiddleware = false
          }
          await propagateServerField(
            'actualMiddlewareFile',
            serverFields.actualMiddlewareFile
          )
          await propagateServerField('middleware', serverFields.middleware)

          currentEntriesHandlingResolve!()
          currentEntriesHandlingResolve = undefined
        }
      }

      handleEntries().catch((err) => {
        console.error(err)
        process.exit(1)
      })
    } catch (e) {
      console.error(e)
    }

    // Write empty manifests
    await mkdir(path.join(distDir, 'server'), { recursive: true })
    await mkdir(path.join(distDir, 'static/development'), { recursive: true })
    await writeFile(
      path.join(distDir, 'package.json'),
      JSON.stringify(
        {
          type: 'commonjs',
        },
        null,
        2
      )
    )
    await currentEntriesHandling
    await writeManifests()

    const overlayMiddleware = getOverlayMiddleware(project)
    let versionInfo: VersionInfo = {
      installed: '0.0.0',
      staleness: 'unknown',
    }
    const hotReloader: NextJsHotReloaderInterface = {
      turbopackProject: project,
      activeWebpackConfigs: undefined,
      serverStats: null,
      edgeServerStats: null,
      async run(req, res, _parsedUrl) {
        // intercept page chunks request and ensure them with turbopack
        if (req.url?.startsWith('/_next/static/chunks/pages/')) {
          const params = matchNextPageBundleRequest(req.url)

          if (params) {
            const decodedPagePath = `/${params.path
              .map((param: string) => decodeURIComponent(param))
              .join('/')}`

            const denormalizedPagePath = denormalizePagePath(decodedPagePath)

            await hotReloader
              .ensurePage({
                page: denormalizedPagePath,
                clientOnly: false,
                definition: undefined,
                url: req.url,
              })
              .catch(console.error)
          }
        }

        await overlayMiddleware(req, res)

        // Request was not finished.
        return { finished: undefined }
      },

      // TODO: Figure out if socket type can match the NextJsHotReloaderInterface
      onHMR(req, socket: Socket, head) {
        wsServer.handleUpgrade(req, socket, head, (client) => {
          clients.add(client)
          client.on('close', () => clients.delete(client))

          client.addEventListener('message', ({ data }) => {
            const parsedData = JSON.parse(
              typeof data !== 'string' ? data.toString() : data
            )

            // Next.js messages
            switch (parsedData.event) {
              case 'ping':
                // Ping doesn't need additional handling in Turbopack.
                break
              case 'span-end': {
                hotReloaderSpan.manualTraceChild(
                  parsedData.spanName,
                  msToNs(parsedData.startTime),
                  msToNs(parsedData.endTime),
                  parsedData.attributes
                )
                break
              }
              case 'client-hmr-latency': // { id, startTime, endTime, page, updatedModules, isPageHidden }
                hotReloaderSpan.manualTraceChild(
                  parsedData.event,
                  msToNs(parsedData.startTime),
                  msToNs(parsedData.endTime),
                  {
                    updatedModules: parsedData.updatedModules,
                    page: parsedData.page,
                    isPageHidden: parsedData.isPageHidden,
                  }
                )
                break
              case 'client-error': // { errorCount, clientId }
              case 'client-warning': // { warningCount, clientId }
              case 'client-success': // { clientId }
              case 'server-component-reload-page': // { clientId }
              case 'client-reload-page': // { clientId }
              case 'client-removed-page': // { page }
              case 'client-full-reload': // { stackTrace, hadRuntimeError }
              case 'client-added-page':
                // TODO
                break

              default:
                // Might be a Turbopack message...
                if (!parsedData.type) {
                  throw new Error(`unrecognized HMR message "${data}"`)
                }
            }

            // Turbopack messages
            switch (parsedData.type) {
              case 'turbopack-subscribe':
                subscribeToHmrEvents(parsedData.path, client)
                break

              case 'turbopack-unsubscribe':
                unsubscribeToHmrEvents(parsedData.path, client)
                break

              default:
                if (!parsedData.event) {
                  throw new Error(
                    `unrecognized Turbopack HMR message "${data}"`
                  )
                }
            }
          })

          const turbopackConnected: TurbopackConnectedAction = {
            action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
          }
          client.send(JSON.stringify(turbopackConnected))

          const errors = []
          for (const pageIssues of issues.values()) {
            for (const issue of pageIssues.values()) {
              errors.push({
                message: formatIssue(issue),
              })
            }
          }

          const sync: SyncAction = {
            action: HMR_ACTIONS_SENT_TO_BROWSER.SYNC,
            errors,
            warnings: [],
            hash: '',
            versionInfo,
          }

          this.send(sync)
        })
      },

      send(action) {
        const payload = JSON.stringify(action)
        for (const client of clients) {
          client.send(payload)
        }
      },

      setHmrServerError(_error) {
        // Not implemented yet.
      },
      clearHmrServerError() {
        // Not implemented yet.
      },
      async start() {
        const enabled = isTestMode || opts.telemetry.isEnabled
        const nextVersionInfo = await getVersionInfo(enabled)
        if (nextVersionInfo) {
          versionInfo = nextVersionInfo
        }
      },
      async stop() {
        // Not implemented yet.
      },
      async getCompilationErrors(page) {
        const thisPageIssues = issues.get(page)
        if (thisPageIssues !== undefined && thisPageIssues.size > 0) {
          // If there is an error related to the requesting page we display it instead of the first error
          return [...thisPageIssues.values()].map(
            (issue) => new Error(formatIssue(issue))
          )
        }

        // Otherwise, return all errors across pages
        const errors = []
        for (const pageIssues of issues.values()) {
          for (const issue of pageIssues.values()) {
            errors.push(new Error(formatIssue(issue)))
          }
        }
        return errors
      },
      invalidate(/* Unused parameter: { reloadAfterInvalidation } */) {
        // Not implemented yet.
      },
      async buildFallbackError() {
        // Not implemented yet.
      },
      async ensurePage({
        page: inputPage,
        // Unused parameters
        // clientOnly,
        // appPaths,
        definition,
        isApp,
        url: requestUrl,
      }) {
        let page = definition?.pathname ?? inputPage

        if (page === '/_error') {
          let finishBuilding = startBuilding(page, requestUrl)
          try {
            if (globalEntries.app) {
              const writtenEndpoint = await processResult(
                '_app',
                await globalEntries.app.writeToDisk()
              )
              processIssues('_app', writtenEndpoint)
            }
            await loadBuildManifest('_app')
            await loadPagesManifest('_app')

            if (globalEntries.document) {
              const writtenEndpoint = await processResult(
                '_document',
                await globalEntries.document.writeToDisk()
              )
              changeSubscription(
                '_document',
                'server',
                false,
                globalEntries.document,
                () => {
                  return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
                }
              )
              processIssues('_document', writtenEndpoint)
            }
            await loadPagesManifest('_document')

            if (globalEntries.error) {
              const writtenEndpoint = await processResult(
                '_error',
                await globalEntries.error.writeToDisk()
              )
              processIssues(page, writtenEndpoint)
            }
            await loadBuildManifest('_error')
            await loadPagesManifest('_error')

            await writeManifests()
          } finally {
            finishBuilding()
          }
          return
        }
        await currentEntriesHandling
        const route =
          curEntries.get(page) ??
          curEntries.get(
            normalizeAppPath(
              normalizeMetadataRoute(definition?.page ?? inputPage)
            )
          )

        if (!route) {
          // TODO: why is this entry missing in turbopack?
          if (page === '/_app') return
          if (page === '/_document') return
          if (page === '/middleware') return
          if (page === '/src/middleware') return
          if (page === '/instrumentation') return
          if (page === '/src/instrumentation') return

          throw new PageNotFoundError(`route not found ${page}`)
        }

        let finishBuilding: (() => void) | undefined = undefined

        try {
          switch (route.type) {
            case 'page': {
              if (isApp) {
                throw new Error(
                  `mis-matched route type: isApp && page for ${page}`
                )
              }

              finishBuilding = startBuilding(page, requestUrl)
              try {
                if (globalEntries.app) {
                  const writtenEndpoint = await processResult(
                    '_app',
                    await globalEntries.app.writeToDisk()
                  )
                  processIssues('_app', writtenEndpoint)
                }
                await loadBuildManifest('_app')
                await loadPagesManifest('_app')

                if (globalEntries.document) {
                  const writtenEndpoint = await processResult(
                    '_document',
                    await globalEntries.document.writeToDisk()
                  )
                  processIssues('_document', writtenEndpoint)
                }
                await loadPagesManifest('_document')

                const writtenEndpoint = await processResult(
                  page,
                  await route.htmlEndpoint.writeToDisk()
                )

                const type = writtenEndpoint?.type

                await loadBuildManifest(page)
                await loadPagesManifest(page)
                if (type === 'edge') {
                  await loadMiddlewareManifest(page, 'pages')
                } else {
                  middlewareManifests.delete(page)
                }
                await loadLoadableManifest(page, 'pages')

                await writeManifests()

                processIssues(page, writtenEndpoint)
              } finally {
                changeSubscription(
                  page,
                  'server',
                  false,
                  route.dataEndpoint,
                  (pageName) => {
                    // Report the next compilation again
                    readyIds.delete(page)
                    return {
                      event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
                      pages: [pageName],
                    }
                  }
                )
                changeSubscription(
                  page,
                  'client',
                  false,
                  route.htmlEndpoint,
                  () => {
                    return {
                      event: HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES,
                    }
                  }
                )
                if (globalEntries.document) {
                  changeSubscription(
                    '_document',
                    'server',
                    false,
                    globalEntries.document,
                    () => {
                      return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
                    }
                  )
                }
              }

              break
            }
            case 'page-api': {
              // We don't throw on ensureOpts.isApp === true here
              // since this can happen when app pages make
              // api requests to page API routes.

              finishBuilding = startBuilding(page, requestUrl)
              const writtenEndpoint = await processResult(
                page,
                await route.endpoint.writeToDisk()
              )

              const type = writtenEndpoint?.type

              await loadPagesManifest(page)
              if (type === 'edge') {
                await loadMiddlewareManifest(page, 'pages')
              } else {
                middlewareManifests.delete(page)
              }
              await loadLoadableManifest(page, 'pages')

              await writeManifests()

              processIssues(page, writtenEndpoint)

              break
            }
            case 'app-page': {
              finishBuilding = startBuilding(page, requestUrl)
              const writtenEndpoint = await processResult(
                page,
                await route.htmlEndpoint.writeToDisk()
              )

              changeSubscription(
                page,
                'server',
                true,
                route.rscEndpoint,
                (_page, change) => {
                  if (
                    change.issues.some((issue) => issue.severity === 'error')
                  ) {
                    // Ignore any updates that has errors
                    // There will be another update without errors eventually
                    return
                  }
                  // Report the next compilation again
                  readyIds.delete(page)
                  return {
                    action:
                      HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
                  }
                }
              )

              const type = writtenEndpoint?.type

              if (type === 'edge') {
                await loadMiddlewareManifest(page, 'app')
              } else {
                middlewareManifests.delete(page)
              }

              await loadAppBuildManifest(page)
              await loadBuildManifest(page, 'app')
              await loadAppPathManifest(page, 'app')
              await loadActionManifest(page)
              await writeManifests()

              processIssues(page, writtenEndpoint, true)

              break
            }
            case 'app-route': {
              finishBuilding = startBuilding(page, requestUrl)
              const writtenEndpoint = await processResult(
                page,
                await route.endpoint.writeToDisk()
              )

              const type = writtenEndpoint?.type

              await loadAppPathManifest(page, 'app-route')
              if (type === 'edge') {
                await loadMiddlewareManifest(page, 'app-route')
              } else {
                middlewareManifests.delete(page)
              }

              await writeManifests()

              processIssues(page, writtenEndpoint, true)

              break
            }
            default: {
              throw new Error(
                `unknown route type ${(route as any).type} for ${page}`
              )
            }
          }
        } finally {
          if (finishBuilding) finishBuilding()
        }
      },
    }

    ;(async function () {
      for await (const updateMessage of project.updateInfoSubscribe(30)) {
        switch (updateMessage.updateType) {
          case 'start': {
            hotReloader.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING })
            break
          }
          case 'end': {
            sendEnqueuedMessages()

            const errors = new Map<string, CompilationError>()
            for (const [, issueMap] of issues) {
              for (const [key, issue] of issueMap) {
                if (errors.has(key)) continue

                const message = formatIssue(issue)

                errors.set(key, {
                  message,
                  details: issue.detail
                    ? renderStyledStringToErrorAnsi(issue.detail)
                    : undefined,
                })
              }
            }

            hotReloader.send({
              action: HMR_ACTIONS_SENT_TO_BROWSER.BUILT,
              hash: String(++hmrHash),
              errors: [...errors.values()],
              warnings: [],
            })

            if (hmrEventHappened) {
              const time = updateMessage.value.duration
              const timeMessage =
                time > 2000 ? `${Math.round(time / 100) / 10}s` : `${time}ms`
              Log.event(`Compiled in ${timeMessage}`)
              hmrEventHappened = false
            }
            break
          }
          default:
        }
      }
    })()

    return hotReloader
  }

  const hotReloader: NextJsHotReloaderInterface = opts.turbo
    ? await createHotReloaderTurbopack()
    : new HotReloaderWebpack(opts.dir, {
        appDir,
        pagesDir,
        distDir: distDir,
        config: opts.nextConfig,
        buildId: 'development',
        telemetry: opts.telemetry,
        rewrites: opts.fsChecker.rewrites,
        previewProps: opts.fsChecker.prerenderManifest.preview,
      })

  await hotReloader.start()

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

      let envChange = false
      let tsconfigChange = false
      let conflictingPageChange = 0
      let hasRootAppNotFound = false

      const { appFiles, pageFiles } = opts.fsChecker

      appFiles.clear()
      pageFiles.clear()
      devPageFiles.clear()

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
          serverFields.actualInstrumentationHookFile = rootFile
          await propagateServerField(
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
          await propagateServerField('reloadMatchers', undefined)
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
          // only log changes in router server
          loadEnvConfig(dir, true, Log, true, (envFilePath) => {
            Log.info(`Reload env: ${envFilePath}`)
          })
          await propagateServerField('loadEnvConfig', [
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
            /* do we want to log if there are syntax errors in tsconfig  while editing? */
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
              allowedRevalidateHeaderKeys: undefined,
              clientRouterFilters,
              config: nextConfig,
              dev: true,
              distDir,
              fetchCacheKeyPrefix: undefined,
              hasRewrites,
              middlewareMatchers: undefined,
              previewModeId: undefined,
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
              if (plugin && plugin.jsConfigPlugin && tsconfigResult) {
                const { resolvedBaseUrl, jsConfig } = tsconfigResult
                const currentResolvedBaseUrl = plugin.resolvedBaseUrl
                const resolvedUrlIndex = config.resolve?.modules?.findIndex(
                  (item) => item === currentResolvedBaseUrl
                )

                if (resolvedBaseUrl) {
                  if (
                    resolvedBaseUrl.baseUrl !== currentResolvedBaseUrl.baseUrl
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
                  allowedRevalidateHeaderKeys: undefined,
                  clientRouterFilters,
                  config: nextConfig,
                  dev: true,
                  distDir,
                  fetchCacheKeyPrefix: undefined,
                  hasRewrites,
                  isClient,
                  isEdgeServer,
                  isNodeOrEdgeCompilation: isNodeServer || isEdgeServer,
                  isNodeServer,
                  middlewareMatchers: undefined,
                  previewModeId: undefined,
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
        hotReloader.invalidate({
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
      await propagateServerField('appPathRoutes', serverFields.appPathRoutes)

      // TODO: pass this to fsChecker/next-dev-server?
      serverFields.middleware = middlewareMatchers
        ? {
            match: null as any,
            page: '/',
            matchers: middlewareMatchers,
          }
        : undefined

      await propagateServerField('middleware', serverFields.middleware)
      serverFields.hasAppNotFound = hasRootAppNotFound

      opts.fsChecker.middlewareMatcher = serverFields.middleware?.matchers
        ? getMiddlewareRouteMatcher(serverFields.middleware?.matchers)
        : undefined

      opts.fsChecker.interceptionRoutes =
        generateInterceptionRoutesRewrites(
          Object.keys(appPaths),
          opts.nextConfig.basePath
        )?.map((item) =>
          buildCustomRoute(
            'before_files_rewrite',
            item,
            opts.nextConfig.basePath,
            opts.nextConfig.experimental.caseSensitiveRoutes
          )
        ) || []

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

      for (const [key, value] of Object.entries(exportPathMap || {})) {
        opts.fsChecker.interceptionRoutes.push(
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
        await propagateServerField('reloadMatchers', undefined)
      }
    })

    wp.watch({ directories: [dir], startTime: 0 })
  })

  const clientPagesManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_CLIENT_PAGES_MANIFEST}`
  opts.fsChecker.devVirtualFsItems.add(clientPagesManifestPath)

  const devMiddlewareManifestPath = `/_next/${CLIENT_STATIC_FILES_PATH}/development/${DEV_MIDDLEWARE_MANIFEST}`
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

        let originalFrame, isEdgeCompiler
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
                  column: frame.column,
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

            const source = await getSourceById(
              !!frame.file?.startsWith(path.sep) ||
                !!frame.file?.startsWith('file:'),
              moduleId,
              compilation
            )

            try {
              originalFrame = await createOriginalStackFrame({
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
              })
            } catch {}
          }

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
      if (err instanceof ModuleBuildError) {
        Log.error(err.message)
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

function renderStyledStringToErrorAnsi(string: StyledString): string {
  switch (string.type) {
    case 'text':
      return string.value
    case 'strong':
      return bold(red(string.value))
    case 'code':
      return green(string.value)
    case 'line':
      return string.value.map(renderStyledStringToErrorAnsi).join('')
    case 'stack':
      return string.value.map(renderStyledStringToErrorAnsi).join('\n')
    default:
      throw new Error('Unknown StyledString type', string)
  }
}

function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * BigInt(MILLISECONDS_IN_NANOSECOND)
}
