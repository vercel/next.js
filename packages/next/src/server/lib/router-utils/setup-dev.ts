import type { NextConfigComplete } from '../../config-shared'
import {
  Endpoint,
  Route,
  TurbopackResult,
  WrittenEndpoint,
  ServerClientChange,
  ServerClientChangeType,
  Issue,
} from '../../../build/swc'
import type { Socket } from 'net'
import ws from 'next/dist/compiled/ws'

import fs from 'fs'
import url from 'url'
import path from 'path'
import qs from 'querystring'
import Watchpack from 'watchpack'
import { loadEnvConfig } from '@next/env'
import isError from '../../../lib/is-error'
import findUp from 'next/dist/compiled/find-up'
import { FilesystemDynamicRoute, buildCustomRoute } from './filesystem'
import * as Log from '../../../build/output/log'
import HotReloader, {
  matchNextPageBundleRequest,
} from '../../dev/hot-reloader-webpack'
import { setGlobal } from '../../../trace/shared'
import { Telemetry } from '../../../telemetry/storage'
import { IncomingMessage, ServerResponse } from 'http'
import loadJsConfig from '../../../build/load-jsconfig'
import { createValidFileMatcher } from '../find-page-file'
import { eventCliSession } from '../../../telemetry/events'
import { getDefineEnv } from '../../../build/webpack/plugins/define-env-plugin'
import { logAppDirError } from '../../dev/log-app-dir-error'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import {
  getStaticInfoIncludingLayouts,
  sortByPageExts,
} from '../../../build/entries'
import { verifyTypeScriptSetup } from '../../../lib/verifyTypeScriptSetup'
import { verifyPartytownSetup } from '../../../lib/verify-partytown-setup'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { buildDataRoute } from './build-data-route'
import { MiddlewareMatcher } from '../../../build/analysis/get-page-static-info'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { createClientRouterFilter } from '../../../lib/create-client-router-filter'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { generateInterceptionRoutesRewrites } from '../../../lib/generate-interception-routes-rewrites'
import { OutputState, store as consoleStore } from '../../../build/output/store'

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
} from '../../../shared/lib/constants'

import {
  MiddlewareRouteMatch,
  getMiddlewareRouteMatcher,
} from '../../../shared/lib/router/utils/middleware-route-matcher'
import { NextBuildContext } from '../../../build/build-context'

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
import { BuildManifest } from '../../get-page-files'
import { mkdir, readFile, writeFile, rename, unlink } from 'fs/promises'
import { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import { AppBuildManifest } from '../../../build/webpack/plugins/app-build-manifest-plugin'
import { PageNotFoundError } from '../../../shared/lib/utils'
import { srcEmptySsgManifest } from '../../../build/webpack/plugins/build-manifest-plugin'
import { PropagateToWorkersField } from './types'
import { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'
import { devPageFiles } from '../../../build/webpack/plugins/next-types-plugin/shared'
import type { LazyRenderServerInstance } from '../router-server'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import {
  HMR_ACTIONS_SENT_TO_BROWSER,
  HMR_ACTION_TYPES,
  NextJsHotReloaderInterface,
  ReloadPageAction,
  TurbopackConnectedAction,
} from '../../dev/hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../../build/swc'
import { debounce } from '../../utils'
import {
  deleteAppClientCache,
  deleteCache,
} from '../../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { normalizeMetadataRoute } from '../../../lib/metadata/get-metadata-route'
import { clearModuleContext } from '../render-server'

const wsServer = new ws.Server({ noServer: true })

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

  let hotReloader: NextJsHotReloaderInterface

  if (opts.turbo) {
    const { loadBindings } =
      require('../../../build/swc') as typeof import('../../../build/swc')

    let bindings = await loadBindings()

    const { jsConfig } = await loadJsConfig(dir, opts.nextConfig)

    // For the debugging purpose, check if createNext or equivalent next instance setup in test cases
    // works correctly. Normally `run-test` hides output so only will be visible when `--debug` flag is used.
    if (process.env.TURBOPACK && process.env.NEXT_TEST_MODE) {
      require('console').log('Creating turbopack project', {
        dir,
        testMode: process.env.NEXT_TEST_MODE,
      })
    }

    const project = await bindings.turbo.createProject({
      projectPath: dir,
      rootPath: opts.nextConfig.experimental.outputFileTracingRoot || dir,
      nextConfig: opts.nextConfig,
      jsConfig,
      watch: true,
      env: process.env as Record<string, string>,
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
    let hmrBuilding = false

    const issues = new Map<string, Map<string, Issue>>()

    function issueKey(issue: Issue): string {
      return `${issue.severity} - ${issue.filePath} - ${issue.title}\n${issue.description}\n\n`
    }

    function formatIssue(issue: Issue) {
      const { filePath, title, description, source, detail } = issue
      let formattedTitle = title.replace(/\n/g, '\n    ')
      let message = ''

      let formattedFilePath = filePath
        .replace('[project]/', '')
        .replaceAll('/./', '/')
        .replace('\\\\?\\', '')

      if (source) {
        const { start, end } = source
        message = `${issue.severity} - ${formattedFilePath}:${start.line + 1}:${
          start.column
        }  ${formattedTitle}`
        if (source.source.content) {
          const {
            codeFrameColumns,
          } = require('next/dist/compiled/babel/code-frame')
          message +=
            '\n\n' +
            codeFrameColumns(
              source.source.content,
              {
                start: { line: start.line + 1, column: start.column + 1 },
                end: { line: end.line + 1, column: end.column + 1 },
              },
              { forceColor: true }
            )
        }
      } else {
        message = `${formattedTitle}`
      }
      if (description) {
        message += `\n${description.replace(/\n/g, '\n    ')}`
      }
      if (detail) {
        message += `\n${detail.replace(/\n/g, '\n    ')}`
      }

      return message
    }

    class ModuleBuildError extends Error {}

    function processIssues(
      displayName: string,
      name: string,
      result: TurbopackResult,
      throwIssue = false
    ) {
      const oldSet = issues.get(name) ?? new Map()
      const newSet = new Map<string, Issue>()
      issues.set(name, newSet)

      const relevantIssues = new Set()

      for (const issue of result.issues) {
        // TODO better formatting
        if (issue.severity !== 'error' && issue.severity !== 'fatal') continue
        const key = issueKey(issue)
        const formatted = formatIssue(issue)
        if (!oldSet.has(key) && !newSet.has(key)) {
          console.error(`  ⚠ ${displayName} ${key} ${formatted}\n\n`)
        }
        newSet.set(key, issue)
        relevantIssues.add(formatted)
      }

      for (const issue of oldSet.keys()) {
        if (!newSet.has(issue)) {
          console.error(`✅ ${displayName} fixed ${issue}`)
        }
      }

      if (relevantIssues.size && throwIssue) {
        throw new ModuleBuildError([...relevantIssues].join('\n\n'))
      }
    }

    async function processResult(
      result: TurbopackResult<WrittenEndpoint>
    ): Promise<TurbopackResult<WrittenEndpoint>> {
      const hasAppPaths = result.serverPaths.some((p) =>
        p.startsWith('server/app')
      )

      if (hasAppPaths) {
        deleteAppClientCache()
      }

      for (const file of result.serverPaths.map((p) => path.join(distDir, p))) {
        clearModuleContext(file)
        deleteCache(file)
      }

      return result
    }

    let hmrHash = 0
    const sendHmrDebounce = debounce(() => {
      interface HmrError {
        moduleName?: string
        message: string
        details?: string
        moduleTrace?: Array<{ moduleName: string }>
        stack?: string
      }

      const errors = new Map<string, HmrError>()
      for (const [, issueMap] of issues) {
        for (const [key, issue] of issueMap) {
          if (errors.has(key)) continue

          const message = formatIssue(issue)

          errors.set(key, {
            message,
            details: issue.detail,
          })
        }
      }

      hotReloader.send({
        action: HMR_ACTIONS_SENT_TO_BROWSER.SYNC,
        hash: String(++hmrHash),
        errors: [...errors.values()],
        warnings: [],
        versionInfo: {
          installed: '0.0.0',
          staleness: 'unknown',
        },
      })
      hmrBuilding = false

      if (errors.size === 0) {
        for (const payload of hmrPayloads.values()) {
          hotReloader.send(payload)
        }
        hmrPayloads.clear()
        if (turbopackUpdates.length > 0) {
          hotReloader.send({
            type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
            data: turbopackUpdates,
          })
          turbopackUpdates.length = 0
        }
      }
    }, 2)

    function sendHmr(key: string, id: string, payload: HMR_ACTION_TYPES) {
      // We've detected a change in some part of the graph. If nothing has
      // been inserted into building yet, then this is the first change
      // emitted, but their may be many more coming.
      if (!hmrBuilding) {
        hotReloader.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING })
        hmrBuilding = true
      }
      hmrPayloads.set(`${key}:${id}`, payload)
      sendHmrDebounce()
    }

    function sendTurbopackMessage(payload: TurbopackUpdate) {
      // We've detected a change in some part of the graph. If nothing has
      // been inserted into building yet, then this is the first change
      // emitted, but their may be many more coming.
      if (!hmrBuilding) {
        hotReloader.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING })
        hmrBuilding = true
      }
      turbopackUpdates.push(payload)
      sendHmrDebounce()
    }

    async function loadPartialManifest<T>(
      name: string,
      pageName: string,
      type: 'pages' | 'app' | 'app-route' | 'middleware' = 'pages'
    ): Promise<T> {
      const manifestPath = path.posix.join(
        distDir,
        `server`,
        type === 'app-route' ? 'app' : type,
        type === 'middleware'
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

    const buildManifests = new Map<string, BuildManifest>()
    const appBuildManifests = new Map<string, AppBuildManifest>()
    const pagesManifests = new Map<string, PagesManifest>()
    const appPathsManifests = new Map<string, PagesManifest>()
    const middlewareManifests = new Map<string, MiddlewareManifest>()
    const clientToHmrSubscription = new Map<
      ws,
      Map<string, AsyncIterator<any>>
    >()
    const clients = new Set<ws>()

    async function loadMiddlewareManifest(
      pageName: string,
      type: 'pages' | 'app' | 'app-route' | 'middleware'
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

    const buildingReported = new Set<string>()

    async function changeSubscription(
      page: string,
      endpoint: Endpoint | undefined,
      makePayload: (
        page: string,
        change: TurbopackResult<ServerClientChange>
      ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
    ) {
      if (!endpoint || changeSubscriptions.has(page)) return

      const changedPromise = endpoint.changed()
      changeSubscriptions.set(page, changedPromise)
      const changed = await changedPromise

      for await (const change of changed) {
        consoleStore.setState(
          {
            loading: true,
            trigger: page,
          } as OutputState,
          true
        )

        processIssues(page, page, change)
        const payload = await makePayload(page, change)
        if (payload) sendHmr('endpoint-change', page, payload)
      }
    }

    async function clearChangeSubscription(page: string) {
      const subscription = await changeSubscriptions.get(page)
      if (subscription) {
        subscription.return?.()
        changeSubscriptions.delete(page)
      }
      issues.delete(page)
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
      manifests: Iterable<MiddlewareManifest>
    ): MiddlewareManifest {
      const manifest: MiddlewareManifest = {
        version: 2,
        middleware: {},
        sortedMiddleware: [],
        functions: {},
      }
      for (const m of manifests) {
        Object.assign(manifest.functions, m.functions)
        Object.assign(manifest.middleware, m.middleware)
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

    async function writeFileAtomic(
      filePath: string,
      content: string
    ): Promise<void> {
      const tempPath = filePath + '.tmp.' + Math.random().toString(36).slice(2)
      try {
        await writeFile(tempPath, content, 'utf-8')
        await rename(tempPath, filePath)
      } catch (e) {
        try {
          await unlink(tempPath)
        } catch {
          // ignore
        }
        throw e
      }
    }

    async function writeBuildManifest(): Promise<void> {
      const buildManifest = mergeBuildManifests(buildManifests.values())
      const buildManifestPath = path.join(distDir, BUILD_MANIFEST)
      deleteCache(buildManifestPath)
      await writeFileAtomic(
        buildManifestPath,
        JSON.stringify(buildManifest, null, 2)
      )
      const content = {
        __rewrites: { afterFiles: [], beforeFiles: [], fallback: [] },
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
        'server/middleware-manifest.json'
      )
      deleteCache(middlewareManifestPath)
      await writeFileAtomic(
        middlewareManifestPath,
        JSON.stringify(middlewareManifest, null, 2)
      )
    }

    async function writeFontManifest(): Promise<void> {
      // TODO: turbopack should write the correct
      // version of this
      const fontManifestPath = path.join(
        distDir,
        'server',
        NEXT_FONT_MANIFEST + '.json'
      )
      deleteCache(fontManifestPath)
      await writeFileAtomic(
        fontManifestPath,
        JSON.stringify(
          {
            pages: {},
            app: {},
            appUsingSizeAdjust: false,
            pagesUsingSizeAdjust: false,
          },
          null,
          2
        )
      )
    }

    async function writeOtherManifests(): Promise<void> {
      const loadableManifestPath = path.join(
        distDir,
        'react-loadable-manifest.json'
      )
      deleteCache(loadableManifestPath)
      await writeFileAtomic(loadableManifestPath, JSON.stringify({}, null, 2))
    }

    async function subscribeToHmrEvents(id: string, client: ws) {
      let mapping = clientToHmrSubscription.get(client)
      if (mapping === undefined) {
        mapping = new Map()
        clientToHmrSubscription.set(client, mapping)
      }
      if (mapping.has(id)) return

      const subscription = project.hmrEvents(id)
      mapping.set(id, subscription)

      // The subscription will always emit once, which is the initial
      // computation. This is not a change, so swallow it.
      try {
        await subscription.next()

        for await (const data of subscription) {
          processIssues('hmr', id, data)
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

          const { middleware } = entrypoints
          // We check for explicit true/false, since it's initialized to
          // undefined during the first loop (middlewareChanges event is
          // unnecessary during the first serve)
          if (prevMiddleware === true && !middleware) {
            // Went from middleware to no middleware
            await clearChangeSubscription('middleware')
            sendHmr('entrypoint-change', 'middleware', {
              event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
            })
          } else if (prevMiddleware === false && middleware) {
            // Went from no middleware to middleware
            sendHmr('endpoint-change', 'middleware', {
              event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
            })
          }
          if (middleware) {
            const processMiddleware = async () => {
              const writtenEndpoint = await processResult(
                await middleware.endpoint.writeToDisk()
              )
              processIssues('middleware', 'middleware', writtenEndpoint)
              await loadMiddlewareManifest('middleware', 'middleware')
              serverFields.actualMiddlewareFile = 'middleware'
              serverFields.middleware = {
                match: null as any,
                page: '/',
                matchers:
                  middlewareManifests.get('middleware')?.middleware['/']
                    .matchers,
              }
            }
            await processMiddleware()

            changeSubscription('middleware', middleware.endpoint, async () => {
              await processMiddleware()
              await propagateServerField(
                'actualMiddlewareFile',
                serverFields.actualMiddlewareFile
              )
              await propagateServerField('middleware', serverFields.middleware)
              await writeMiddlewareManifest()

              console.log('middleware changes')
              return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
            })
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
    await writeBuildManifest()
    await writeAppBuildManifest()
    await writeFallbackBuildManifest()
    await writePagesManifest()
    await writeAppPathsManifest()
    await writeMiddlewareManifest()
    await writeOtherManifests()
    await writeFontManifest()

    const turbopackHotReloader: NextJsHotReloaderInterface = {
      activeWebpackConfigs: undefined,
      serverStats: null,
      edgeServerStats: null,
      async run(req, _res, _parsedUrl) {
        // intercept page chunks request and ensure them with turbopack
        if (req.url?.startsWith('/_next/static/chunks/pages/')) {
          const params = matchNextPageBundleRequest(req.url)

          if (params) {
            const decodedPagePath = `/${params.path
              .map((param: string) => decodeURIComponent(param))
              .join('/')}`

            await hotReloader
              .ensurePage({
                page: decodedPagePath,
                clientOnly: false,
              })
              .catch(console.error)
          }
        }
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
              case 'span-end':
              case 'client-error': // { errorCount, clientId }
              case 'client-warning': // { warningCount, clientId }
              case 'client-success': // { clientId }
              case 'server-component-reload-page': // { clientId }
              case 'client-reload-page': // { clientId }
              case 'client-removed-page': // { page }
              case 'client-full-reload': // { stackTrace, hadRuntimeError }
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
            type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
          }
          client.send(JSON.stringify(turbopackConnected))
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
        // Not implemented yet.
      },
      async stop() {
        // Not implemented yet.
      },
      async getCompilationErrors(_page) {
        return []
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
        match,
        isApp,
      }) {
        let page = match?.definition?.pathname ?? inputPage

        if (page === '/_error') {
          if (globalEntries.app) {
            const writtenEndpoint = await processResult(
              await globalEntries.app.writeToDisk()
            )
            processIssues('_app', '_app', writtenEndpoint)
          }
          await loadBuildManifest('_app')
          await loadPagesManifest('_app')

          if (globalEntries.document) {
            const writtenEndpoint = await processResult(
              await globalEntries.document.writeToDisk()
            )
            changeSubscription('_document', globalEntries.document, () => {
              return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
            })
            processIssues('_document', '_document', writtenEndpoint)
          }
          await loadPagesManifest('_document')

          if (globalEntries.error) {
            const writtenEndpoint = await processResult(
              await globalEntries.error.writeToDisk()
            )
            processIssues(page, page, writtenEndpoint)
          }
          await loadBuildManifest('_error')
          await loadPagesManifest('_error')

          await writeBuildManifest()
          await writeFallbackBuildManifest()
          await writePagesManifest()
          await writeMiddlewareManifest()
          await writeOtherManifests()

          return
        }

        await currentEntriesHandling
        const route =
          curEntries.get(page) ??
          curEntries.get(
            normalizeAppPath(
              normalizeMetadataRoute(match?.definition?.page ?? inputPage)
            )
          )

        if (!route) {
          // TODO: why is this entry missing in turbopack?
          if (page === '/_app') return
          if (page === '/_document') return
          if (page === '/middleware') return

          throw new PageNotFoundError(`route not found ${page}`)
        }

        if (!buildingReported.has(page)) {
          buildingReported.add(page)
          let suffix
          switch (route.type) {
            case 'app-page':
              suffix = 'page'
              break
            case 'app-route':
              suffix = 'route'
              break
            case 'page':
            case 'page-api':
              suffix = ''
              break
            default:
              throw new Error('Unexpected route type ' + route.type)
          }

          consoleStore.setState(
            {
              loading: true,
              trigger: `${page}${
                !page.endsWith('/') && suffix.length > 0 ? '/' : ''
              }${suffix}`,
            } as OutputState,
            true
          )
        }

        switch (route.type) {
          case 'page': {
            if (isApp) {
              throw new Error(
                `mis-matched route type: isApp && page for ${page}`
              )
            }

            if (globalEntries.app) {
              const writtenEndpoint = await processResult(
                await globalEntries.app.writeToDisk()
              )
              processIssues('_app', '_app', writtenEndpoint)
            }
            await loadBuildManifest('_app')
            await loadPagesManifest('_app')

            if (globalEntries.document) {
              const writtenEndpoint = await processResult(
                await globalEntries.document.writeToDisk()
              )

              changeSubscription('_document', globalEntries.document, () => {
                return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
              })
              processIssues('_document', '_document', writtenEndpoint)
            }
            await loadPagesManifest('_document')

            const writtenEndpoint = await processResult(
              await route.htmlEndpoint.writeToDisk()
            )

            changeSubscription(page, route.dataEndpoint, (pageName, change) => {
              switch (change.type) {
                case ServerClientChangeType.Server:
                case ServerClientChangeType.Both:
                  return {
                    event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
                    pages: [pageName],
                  }
                default:
              }
            })

            const type = writtenEndpoint?.type

            await loadBuildManifest(page)
            await loadPagesManifest(page)
            if (type === 'edge') {
              await loadMiddlewareManifest(page, 'pages')
            } else {
              middlewareManifests.delete(page)
            }

            await writeBuildManifest()
            await writeFallbackBuildManifest()
            await writePagesManifest()
            await writeMiddlewareManifest()
            await writeOtherManifests()

            processIssues(page, page, writtenEndpoint)

            break
          }
          case 'page-api': {
            // We don't throw on ensureOpts.isApp === true here
            // since this can happen when app pages make
            // api requests to page API routes.

            const writtenEndpoint = await processResult(
              await route.endpoint.writeToDisk()
            )

            const type = writtenEndpoint?.type

            await loadPagesManifest(page)
            if (type === 'edge') {
              await loadMiddlewareManifest(page, 'pages')
            } else {
              middlewareManifests.delete(page)
            }

            await writePagesManifest()
            await writeMiddlewareManifest()
            await writeOtherManifests()

            processIssues(page, page, writtenEndpoint)

            break
          }
          case 'app-page': {
            const writtenEndpoint = await processResult(
              await route.htmlEndpoint.writeToDisk()
            )

            changeSubscription(page, route.rscEndpoint, (_page, change) => {
              switch (change.type) {
                case ServerClientChangeType.Server:
                case ServerClientChangeType.Both:
                  return {
                    action:
                      HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
                  }
                default:
              }
            })

            await loadAppBuildManifest(page)
            await loadBuildManifest(page, 'app')
            await loadAppPathManifest(page, 'app')

            await writeAppBuildManifest()
            await writeBuildManifest()
            await writeAppPathsManifest()
            await writeMiddlewareManifest()
            await writeOtherManifests()

            processIssues(page, page, writtenEndpoint, true)

            break
          }
          case 'app-route': {
            const writtenEndpoint = await processResult(
              await route.endpoint.writeToDisk()
            )

            const type = writtenEndpoint?.type

            await loadAppPathManifest(page, 'app-route')
            if (type === 'edge') {
              await loadMiddlewareManifest(page, 'app-route')
            } else {
              middlewareManifests.delete(page)
            }

            await writeAppBuildManifest()
            await writeAppPathsManifest()
            await writeMiddlewareManifest()
            await writeMiddlewareManifest()
            await writeOtherManifests()

            processIssues(page, page, writtenEndpoint, true)

            break
          }
          default: {
            throw new Error(`unknown route type ${route.type} for ${page}`)
          }
        }

        consoleStore.setState(
          {
            loading: false,
          } as OutputState,
          true
        )
      },
    }

    hotReloader = turbopackHotReloader
  } else {
    hotReloader = new HotReloader(opts.dir, {
      appDir,
      pagesDir,
      distDir: distDir,
      config: opts.nextConfig,
      buildId: 'development',
      telemetry: opts.telemetry,
      rewrites: opts.fsChecker.rewrites,
      previewProps: opts.fsChecker.prerenderManifest.preview,
    })
  }

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
          NextBuildContext.hasInstrumentationHook = true
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
        generateInterceptionRoutesRewrites(Object.keys(appPaths))?.map((item) =>
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

  const result = await startWatcher(opts)

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
  return result
}
