import type { Socket } from 'net'
import { mkdir, writeFile } from 'fs/promises'
import { join, extname, relative } from 'path'
import { pathToFileURL } from 'url'

import ws from 'next/dist/compiled/ws'

import type { OutputState } from '../../build/output/store'
import { store as consoleStore } from '../../build/output/store'
import type {
  CompilationError,
  HmrMessageSentToBrowser,
  NextJsHotReloaderInterface,
  ReloadPageMessage,
  SyncMessage,
  TurbopackConnectedMessage,
} from './hot-reloader-types'
import { HMR_MESSAGE_SENT_TO_BROWSER } from './hot-reloader-types'
import type {
  Update as TurbopackUpdate,
  Endpoint,
  WrittenEndpoint,
  TurbopackResult,
  Project,
  Entrypoints,
} from '../../build/swc/types'
import { createDefineEnv } from '../../build/swc'
import * as Log from '../../build/output/log'
import { BLOCKED_PAGES } from '../../shared/lib/constants'
import {
  getOverlayMiddleware,
  getSourceMapMiddleware,
  getOriginalStackFrames,
} from './middleware-turbopack'
import { PageNotFoundError } from '../../shared/lib/utils'
import { debounce } from '../utils'
import { deleteCache } from './require-cache'
import {
  clearAllModuleContexts,
  clearModuleContext,
} from '../lib/render-server'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { trace } from '../../trace'
import {
  AssetMapper,
  type ChangeSubscriptions,
  type ClientState,
  handleEntrypoints,
  handlePagesErrorRoute,
  handleRouteType,
  hasEntrypointForKey,
  msToNs,
  type ReadyIds,
  type SendHmr,
  type StartBuilding,
  processTopLevelIssues,
  printNonFatalIssue,
  normalizedPageToTurbopackStructureRoute,
} from './turbopack-utils'
import {
  propagateServerField,
  type ServerFields,
  type SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import { findPagePathData } from './on-demand-entry-handler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import {
  type EntryKey,
  getEntryKey,
  splitEntryKey,
} from '../../shared/lib/turbopack/entry-key'
import {
  createBinaryHmrMessageData,
  FAST_REFRESH_RUNTIME_RELOAD,
} from './messages'
import { generateEncryptionKeyBase64 } from '../app-render/encryption-utils-server'
import { isAppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import type { ModernSourceMapPayload } from '../lib/source-maps'
import { getNodeDebugType } from '../lib/utils'
import { isMetadataRouteFile } from '../../lib/metadata/is-metadata-route'
import { setBundlerFindSourceMapImplementation } from '../patch-error-inspect'
import { getNextErrorFeedbackMiddleware } from '../../next-devtools/server/get-next-error-feedback-middleware'
import {
  formatIssue,
  isFileSystemCacheEnabledForDev,
  isWellKnownError,
  processIssues,
  renderStyledStringToErrorAnsi,
  type EntryIssuesMap,
  type TopLevelIssuesMap,
} from '../../shared/lib/turbopack/utils'
import { getDevOverlayFontMiddleware } from '../../next-devtools/server/font/get-dev-overlay-font-middleware'
import { devIndicatorServerState } from './dev-indicator-server-state'
import { getDisableDevIndicatorMiddleware } from '../../next-devtools/server/dev-indicator-middleware'
import { getRestartDevServerMiddleware } from '../../next-devtools/server/restart-dev-server-middleware'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { getSupportedBrowsers, printBuildErrors } from '../../build/utils'
import {
  receiveBrowserLogsTurbopack,
  handleClientFileLogs,
} from './browser-logs/receive-logs'
import { normalizePath } from '../../lib/normalize-path'
import {
  devToolsConfigMiddleware,
  getDevToolsConfig,
} from '../../next-devtools/server/devtools-config-middleware'
import {
  connectReactDebugChannel,
  deleteReactDebugChannel,
  setReactDebugChannel,
} from './debug-channel'
import {
  getVersionInfo,
  matchNextPageBundleRequest,
} from './hot-reloader-shared-utils'
import { getMcpMiddleware } from '../mcp/get-mcp-middleware'
import { handleErrorStateResponse } from '../mcp/tools/get-errors'
import { handlePageMetadataResponse } from '../mcp/tools/get-page-metadata'
import { setStackFrameResolver } from '../mcp/tools/utils/format-errors'
import { recordMcpTelemetry } from '../mcp/mcp-telemetry-tracker'
import { getFileLogger } from './browser-logs/file-logger'
import type { ServerCacheStatus } from '../../next-devtools/dev-overlay/cache-indicator'
import type { Lockfile } from '../../build/lockfile'

const wsServer = new ws.Server({ noServer: true })
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

const sessionId = Math.floor(Number.MAX_SAFE_INTEGER * Math.random())

declare const __next__clear_chunk_cache__: (() => void) | null | undefined

/**
 * Replaces turbopack:///[project] with the specified project in the `source` field.
 */
function rewriteTurbopackSources(
  projectRoot: string,
  sourceMap: ModernSourceMapPayload
): void {
  if ('sections' in sourceMap) {
    for (const section of sourceMap.sections) {
      rewriteTurbopackSources(projectRoot, section.map)
    }
  } else {
    for (let i = 0; i < sourceMap.sources.length; i++) {
      sourceMap.sources[i] = pathToFileURL(
        join(
          projectRoot,
          sourceMap.sources[i].replace(/turbopack:\/\/\/\[project\]/, '')
        )
      ).toString()
    }
  }
}

function getSourceMapFromTurbopack(
  project: Project,
  projectRoot: string,
  sourceURL: string
): ModernSourceMapPayload | undefined {
  let sourceMapJson: string | null = null

  try {
    sourceMapJson = project.getSourceMapSync(sourceURL)
  } catch (err) {}

  if (sourceMapJson === null) {
    return undefined
  } else {
    const payload: ModernSourceMapPayload = JSON.parse(sourceMapJson)
    // The sourcemap from Turbopack is not yet written to disk so its `sources`
    // are not absolute paths yet. We need to rewrite them to be absolute paths.
    rewriteTurbopackSources(projectRoot, payload)
    return payload
  }
}

export async function createHotReloaderTurbopack(
  opts: SetupOpts & { isSrcDir: boolean },
  serverFields: ServerFields,
  distDir: string,
  resetFetch: () => void,
  lockfile: Lockfile | undefined
): Promise<NextJsHotReloaderInterface> {
  const dev = true
  const buildId = 'development'
  const { nextConfig, dir: projectPath } = opts

  const { loadBindings } =
    require('../../build/swc') as typeof import('../../build/swc')

  let bindings = await loadBindings()

  // For the debugging purpose, check if createNext or equivalent next instance setup in test cases
  // works correctly. Normally `run-test` hides output so only will be visible when `--debug` flag is used.
  if (isTestMode) {
    ;(require('console') as typeof import('console')).log(
      'Creating turbopack project',
      {
        dir: projectPath,
        testMode: isTestMode,
      }
    )
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

  // Initialize log monitor for file logging
  // Enable logging by default in development mode
  const mcpServerEnabled = !!nextConfig.experimental.mcpServer
  const fileLogger = getFileLogger()
  fileLogger.initialize(distDir, mcpServerEnabled)

  const encryptionKey = await generateEncryptionKeyBase64({
    isBuild: false,
    distDir,
  })

  // TODO: Implement
  let clientRouterFilters: any
  if (nextConfig.experimental.clientRouterFilter) {
    // TODO this need to be set correctly for filesystem cache to work
  }

  const supportedBrowsers = getSupportedBrowsers(projectPath, dev)
  const currentNodeJsVersion = process.versions.node

  const rootPath =
    opts.nextConfig.turbopack?.root ||
    opts.nextConfig.outputFileTracingRoot ||
    projectPath
  const project = await bindings.turbo.createProject(
    {
      rootPath,
      projectPath: normalizePath(relative(rootPath, projectPath) || '.'),
      distDir,
      nextConfig: opts.nextConfig,
      watch: {
        enable: dev,
        pollIntervalMs: nextConfig.watchOptions?.pollIntervalMs,
      },
      dev,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        clientRouterFilters,
        config: nextConfig,
        dev,
        distDir,
        projectPath,
        fetchCacheKeyPrefix: opts.nextConfig.experimental.fetchCacheKeyPrefix,
        hasRewrites,
        // TODO: Implement
        middlewareMatchers: undefined,
        rewrites: opts.fsChecker.rewrites,
      }),
      buildId,
      encryptionKey,
      previewProps: opts.fsChecker.prerenderManifest.preview,
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling: false,
      currentNodeJsVersion,
    },
    {
      persistentCaching: isFileSystemCacheEnabledForDev(opts.nextConfig),
      memoryLimit: opts.nextConfig.experimental?.turbopackMemoryLimit,
      isShortSession: false,
    }
  )
  backgroundLogCompilationEvents(project, {
    eventTypes: ['StartupCacheInvalidationEvent', 'TimingEvent'],
  })
  setBundlerFindSourceMapImplementation(
    getSourceMapFromTurbopack.bind(null, project, projectPath)
  )
  opts.onDevServerCleanup?.(async () => {
    setBundlerFindSourceMapImplementation(() => undefined)
    await project.onExit()
    await lockfile?.unlock()
  })
  const entrypointsSubscription = project.entrypointsSubscribe()

  const currentWrittenEntrypoints: Map<EntryKey, WrittenEndpoint> = new Map()
  const currentEntrypoints: Entrypoints = {
    global: {
      app: undefined,
      document: undefined,
      error: undefined,

      middleware: undefined,
      instrumentation: undefined,
    },

    page: new Map(),
    app: new Map(),
  }

  const currentTopLevelIssues: TopLevelIssuesMap = new Map()
  const currentEntryIssues: EntryIssuesMap = new Map()

  const manifestLoader = new TurbopackManifestLoader({
    buildId,
    distDir,
    encryptionKey,
  })

  // Dev specific
  const changeSubscriptions: ChangeSubscriptions = new Map()
  const serverPathState = new Map<string, string>()
  const readyIds: ReadyIds = new Set()
  let currentEntriesHandlingResolve: ((value?: unknown) => void) | undefined
  let currentEntriesHandling = new Promise(
    (resolve) => (currentEntriesHandlingResolve = resolve)
  )

  const assetMapper = new AssetMapper()

  function clearRequireCache(
    key: EntryKey,
    writtenEndpoint: WrittenEndpoint,
    {
      force,
    }: {
      // Always clear the cache, don't check if files have changed
      force?: boolean
    } = {}
  ): boolean {
    if (force) {
      for (const { path, contentHash } of writtenEndpoint.serverPaths) {
        // We ignore source maps
        if (path.endsWith('.map')) continue
        const localKey = `${key}:${path}`
        serverPathState.set(localKey, contentHash)
        serverPathState.set(path, contentHash)
      }
    } else {
      // Figure out if the server files have changed
      let hasChange = false
      for (const { path, contentHash } of writtenEndpoint.serverPaths) {
        // We ignore source maps
        if (path.endsWith('.map')) continue
        const localKey = `${key}:${path}`
        const localHash = serverPathState.get(localKey)
        const globalHash = serverPathState.get(path)
        if (
          (localHash && localHash !== contentHash) ||
          (globalHash && globalHash !== contentHash)
        ) {
          hasChange = true
          serverPathState.set(localKey, contentHash)
          serverPathState.set(path, contentHash)
        } else {
          if (!localHash) {
            serverPathState.set(localKey, contentHash)
          }
          if (!globalHash) {
            serverPathState.set(path, contentHash)
          }
        }
      }

      if (!hasChange) {
        return false
      }
    }

    resetFetch()

    // Not available in:
    // - Pages Router (no server-side HMR)
    // - Edge Runtime (uses browser runtime which already disposes chunks individually)
    if (typeof __next__clear_chunk_cache__ === 'function') {
      __next__clear_chunk_cache__()
    }

    const serverPaths = writtenEndpoint.serverPaths.map(({ path: p }) =>
      join(distDir, p)
    )

    for (const file of serverPaths) {
      clearModuleContext(file)
      deleteCache(file)
    }

    return true
  }

  const buildingIds = new Set()

  const startBuilding: StartBuilding = (id, requestUrl, forceRebuild) => {
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
        hmrEventHappened = false
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

  const clientsWithoutRequestId = new Set<ws>()
  const clientsByRequestId = new Map<string, ws>()
  const cacheStatusesByRequestId = new Map<string, ServerCacheStatus>()
  const clientStates = new WeakMap<ws, ClientState>()

  function sendToClient(client: ws, message: HmrMessageSentToBrowser) {
    const data =
      typeof message.type === 'number'
        ? createBinaryHmrMessageData(message)
        : JSON.stringify(message)

    client.send(data)
  }

  function sendEnqueuedMessages() {
    for (const [, issueMap] of currentEntryIssues) {
      if (
        [...issueMap.values()].filter((i) => i.severity !== 'warning').length >
        0
      ) {
        // During compilation errors we want to delay the HMR events until errors are fixed
        return
      }
    }

    for (const client of [
      ...clientsWithoutRequestId,
      ...clientsByRequestId.values(),
    ]) {
      const state = clientStates.get(client)
      if (!state) {
        continue
      }

      for (const [, issueMap] of state.clientIssues) {
        if (
          [...issueMap.values()].filter((i) => i.severity !== 'warning')
            .length > 0
        ) {
          // During compilation errors we want to delay the HMR events until errors are fixed
          return
        }
      }

      for (const message of state.messages.values()) {
        sendToClient(client, message)
      }
      state.messages.clear()

      if (state.turbopackUpdates.length > 0) {
        sendToClient(client, {
          type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
          data: state.turbopackUpdates,
        })
        state.turbopackUpdates.length = 0
      }
    }
  }
  const sendEnqueuedMessagesDebounce = debounce(sendEnqueuedMessages, 2)

  const sendHmr: SendHmr = (id: string, message: HmrMessageSentToBrowser) => {
    for (const client of [
      ...clientsWithoutRequestId,
      ...clientsByRequestId.values(),
    ]) {
      clientStates.get(client)?.messages.set(id, message)
    }

    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  function sendTurbopackMessage(payload: TurbopackUpdate) {
    // TODO(PACK-2049): For some reason we end up emitting hundreds of issues messages on bigger apps,
    //   a lot of which are duplicates.
    //   They are currently not handled on the client at all, so might as well not send them for now.
    payload.diagnostics = []
    payload.issues = []

    for (const client of [
      ...clientsWithoutRequestId,
      ...clientsByRequestId.values(),
    ]) {
      clientStates.get(client)?.turbopackUpdates.push(payload)
    }

    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  async function subscribeToChanges(
    key: EntryKey,
    includeIssues: boolean,
    endpoint: Endpoint,
    createMessage: (
      change: TurbopackResult,
      hash: string
    ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void,
    onError?: (
      error: Error
    ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void
  ) {
    if (changeSubscriptions.has(key)) {
      return
    }

    const { side } = splitEntryKey(key)

    const changedPromise = endpoint[`${side}Changed`](includeIssues)
    changeSubscriptions.set(key, changedPromise)
    try {
      const changed = await changedPromise

      for await (const change of changed) {
        processIssues(currentEntryIssues, key, change, false, true)
        // TODO: Get an actual content hash from Turbopack.
        const message = await createMessage(change, String(++hmrHash))
        if (message) {
          sendHmr(key, message)
        }
      }
    } catch (e) {
      changeSubscriptions.delete(key)
      const payload = await onError?.(e as Error)
      if (payload) {
        sendHmr(key, payload)
      }
      return
    }
    changeSubscriptions.delete(key)
  }

  async function unsubscribeFromChanges(key: EntryKey) {
    const subscription = await changeSubscriptions.get(key)
    if (subscription) {
      await subscription.return?.()
      changeSubscriptions.delete(key)
    }
    currentEntryIssues.delete(key)
  }

  async function subscribeToHmrEvents(client: ws, id: string) {
    const key = getEntryKey('assets', 'client', id)
    if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
      // maybe throw an error / force the client to reload?
      return
    }

    const state = clientStates.get(client)
    if (!state || state.subscriptions.has(id)) {
      return
    }

    const subscription = project!.hmrEvents(id)
    state.subscriptions.set(id, subscription)

    // The subscription will always emit once, which is the initial
    // computation. This is not a change, so swallow it.
    try {
      await subscription.next()

      for await (const data of subscription) {
        processIssues(state.clientIssues, key, data, false, true)
        if (data.type !== 'issues') {
          sendTurbopackMessage(data)
        }
      }
    } catch (e) {
      // The client might be using an HMR session from a previous server, tell them
      // to fully reload the page to resolve the issue. We can't use
      // `hotReloader.send` since that would force every connected client to
      // reload, only this client is out of date.
      const reloadMessage: ReloadPageMessage = {
        type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
        data: `error in HMR event subscription for ${id}: ${e}`,
      }
      sendToClient(client, reloadMessage)
      client.close()
      return
    }
  }

  function unsubscribeFromHmrEvents(client: ws, id: string) {
    const state = clientStates.get(client)
    if (!state) {
      return
    }

    const subscription = state.subscriptions.get(id)
    subscription?.return!()

    const key = getEntryKey('assets', 'client', id)
    state.clientIssues.delete(key)
  }

  async function handleEntrypointsSubscription() {
    for await (const entrypoints of entrypointsSubscription) {
      if (!currentEntriesHandlingResolve) {
        currentEntriesHandling = new Promise(
          // eslint-disable-next-line no-loop-func
          (resolve) => (currentEntriesHandlingResolve = resolve)
        )
      }

      // Always process issues/diagnostics, even if there are no entrypoints yet
      processTopLevelIssues(currentTopLevelIssues, entrypoints)

      // Certain crtical issues prevent any entrypoints from being constructed so return early
      if (!('routes' in entrypoints)) {
        printBuildErrors(entrypoints, true)

        currentEntriesHandlingResolve!()
        currentEntriesHandlingResolve = undefined
        continue
      }

      const routes = entrypoints.routes
      const existingRoutes = [
        ...currentEntrypoints.app.keys(),
        ...currentEntrypoints.page.keys(),
      ]
      const newRoutes = [...routes.keys()]

      const addedRoutes = newRoutes.filter(
        (route) =>
          !currentEntrypoints.app.has(route) &&
          !currentEntrypoints.page.has(route)
      )
      const removedRoutes = existingRoutes.filter((route) => !routes.has(route))

      await handleEntrypoints({
        entrypoints: entrypoints as any,

        currentEntrypoints,

        currentEntryIssues,
        manifestLoader,
        devRewrites: opts.fsChecker.rewrites,
        productionRewrites: undefined,
        logErrors: true,

        dev: {
          assetMapper,
          changeSubscriptions,
          clients: [...clientsWithoutRequestId, ...clientsByRequestId.values()],
          clientStates,
          serverFields,

          hooks: {
            handleWrittenEndpoint: (id, result, forceDeleteCache) => {
              currentWrittenEntrypoints.set(id, result)
              return clearRequireCache(id, result, { force: forceDeleteCache })
            },
            propagateServerField: propagateServerField.bind(null, opts),
            sendHmr,
            startBuilding,
            subscribeToChanges,
            unsubscribeFromChanges,
            unsubscribeFromHmrEvents,
          },
        },
      })

      // Reload matchers when the files have been compiled
      await propagateServerField(opts, 'reloadMatchers', undefined)

      if (addedRoutes.length > 0 || removedRoutes.length > 0) {
        // When the list of routes changes a new manifest should be fetched for Pages Router.
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE,
          data: [
            {
              devPagesManifest: true,
            },
          ],
        })
      }

      for (const route of addedRoutes) {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE,
          data: [route],
        })
      }

      for (const route of removedRoutes) {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE,
          data: [route],
        })
      }

      currentEntriesHandlingResolve!()
      currentEntriesHandlingResolve = undefined
    }
  }

  await mkdir(join(distDir, 'server'), { recursive: true })
  await mkdir(join(distDir, 'static', buildId), { recursive: true })
  await writeFile(
    join(distDir, 'package.json'),
    JSON.stringify(
      {
        type: 'commonjs',
      },
      null,
      2
    )
  )

  const middlewares = [
    getOverlayMiddleware({
      project,
      projectPath,
      isSrcDir: opts.isSrcDir,
    }),
    getSourceMapMiddleware(project),
    getNextErrorFeedbackMiddleware(opts.telemetry),
    getDevOverlayFontMiddleware(),
    getDisableDevIndicatorMiddleware(),
    getRestartDevServerMiddleware({
      telemetry: opts.telemetry,
      turbopackProject: project,
    }),
    devToolsConfigMiddleware({
      distDir,
      sendUpdateSignal: (data) => {
        hotReloader.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG,
          data,
        })
      },
    }),
    ...(nextConfig.experimental.mcpServer
      ? [
          getMcpMiddleware({
            projectPath,
            distDir,
            sendHmrMessage: (message) => hotReloader.send(message),
            getActiveConnectionCount: () =>
              clientsWithoutRequestId.size + clientsByRequestId.size,
            getDevServerUrl: () => process.env.__NEXT_PRIVATE_ORIGIN,
          }),
        ]
      : []),
  ]

  setStackFrameResolver(async (request) => {
    return getOriginalStackFrames({
      project,
      projectPath,
      isServer: request.isServer,
      isEdgeServer: request.isEdgeServer,
      isAppDirectory: request.isAppDirectory,
      frames: request.frames,
    })
  })

  let versionInfoCached: ReturnType<typeof getVersionInfo> | undefined
  // This fetch, even though not awaited, is not kicked off eagerly because the first `fetch()` in
  // Node.js adds roughly 20ms main-thread blocking to load the SSL certificate cache
  // We don't want that blocking time to be in the hot path for the `ready in` logging.
  // Instead, the fetch is kicked off lazily when the first `getVersionInfoCached()` is called.
  const getVersionInfoCached = (): ReturnType<typeof getVersionInfo> => {
    if (!versionInfoCached) {
      versionInfoCached = getVersionInfo()
    }
    return versionInfoCached
  }

  let devtoolsFrontendUrl: string | undefined
  const nodeDebugType = getNodeDebugType()
  if (nodeDebugType) {
    const debugPort = process.debugPort
    let debugInfo
    try {
      // It requires to use 127.0.0.1 instead of localhost for server-side fetching.
      const debugInfoList = await fetch(
        `http://127.0.0.1:${debugPort}/json/list`
      ).then((res) => res.json())
      debugInfo = debugInfoList[0]
    } catch {}
    if (debugInfo) {
      devtoolsFrontendUrl = debugInfo.devtoolsFrontendUrl
    }
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

      for (const middleware of middlewares) {
        let calledNext = false

        await middleware(req, res, () => {
          calledNext = true
        })

        if (!calledNext) {
          return { finished: true }
        }
      }

      // Request was not finished.
      return { finished: undefined }
    },

    // TODO: Figure out if socket type can match the NextJsHotReloaderInterface
    onHMR(req, socket: Socket, head, onUpgrade) {
      wsServer.handleUpgrade(req, socket, head, (client) => {
        const clientIssues: EntryIssuesMap = new Map()
        const subscriptions: Map<string, AsyncIterator<any>> = new Map()

        const requestId = req.url
          ? new URL(req.url, 'http://n').searchParams.get('id')
          : null

        // Clients with a request ID are inferred App Router clients. If Cache
        // Components is not enabled, we consider those legacy clients. Pages
        // Router clients are also considered legacy clients. TODO: Maybe mark
        // clients as App Router / Pages Router clients explicitly, instead of
        // inferring it from the presence of a request ID.
        if (requestId) {
          clientsByRequestId.set(requestId, client)
          const enableCacheComponents = nextConfig.cacheComponents
          if (enableCacheComponents) {
            onUpgrade(client, { isLegacyClient: false })
            const cacheStatus = cacheStatusesByRequestId.get(requestId)
            if (cacheStatus !== undefined) {
              sendToClient(client, {
                type: HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR,
                state: cacheStatus,
              })
              cacheStatusesByRequestId.delete(requestId)
            }
          } else {
            onUpgrade(client, { isLegacyClient: true })
          }
        } else {
          clientsWithoutRequestId.add(client)
          onUpgrade(client, { isLegacyClient: true })
        }

        clientStates.set(client, {
          clientIssues,
          messages: new Map(),
          turbopackUpdates: [],
          subscriptions,
        })

        client.on('close', () => {
          // Remove active subscriptions
          for (const subscription of subscriptions.values()) {
            subscription.return?.()
          }
          clientStates.delete(client)

          if (requestId) {
            clientsByRequestId.delete(requestId)
            deleteReactDebugChannel(requestId)
          } else {
            clientsWithoutRequestId.delete(client)
          }
        })

        client.addEventListener('message', async ({ data }) => {
          const parsedData = JSON.parse(
            typeof data !== 'string' ? data.toString() : data
          )

          // Next.js messages
          switch (parsedData.event) {
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
              const { hadRuntimeError, dependencyChain } = parsedData
              if (hadRuntimeError) {
                Log.warn(FAST_REFRESH_RUNTIME_RELOAD)
              }
              if (
                Array.isArray(dependencyChain) &&
                typeof dependencyChain[0] === 'string'
              ) {
                const cleanedModulePath = dependencyChain[0]
                  .replace(/^\[project\]/, '.')
                  .replace(/ \[.*\] \(.*\)$/, '')
                Log.warn(
                  `Fast Refresh had to perform a full reload when ${cleanedModulePath} changed. Read more: https://nextjs.org/docs/messages/fast-refresh-reload`
                )
              }
              break
            case 'client-added-page':
              // TODO
              break
            case 'browser-logs': {
              if (nextConfig.experimental.browserDebugInfoInTerminal) {
                await receiveBrowserLogsTurbopack({
                  entries: parsedData.entries,
                  router: parsedData.router,
                  sourceType: parsedData.sourceType,
                  project,
                  projectPath,
                  distDir,
                  config: nextConfig.experimental.browserDebugInfoInTerminal,
                })
              }
              break
            }
            case 'client-file-logs': {
              // Always log to file regardless of terminal flag
              await handleClientFileLogs(parsedData.logs)
              break
            }
            case 'ping': {
              // Handle ping events to keep WebSocket connections alive
              // No-op - just acknowledge the ping
              break
            }

            case 'mcp-error-state-response': {
              handleErrorStateResponse(
                parsedData.requestId,
                parsedData.errorState,
                parsedData.url
              )
              break
            }

            case 'mcp-page-metadata-response': {
              handlePageMetadataResponse(
                parsedData.requestId,
                parsedData.segmentTrieData,
                parsedData.url
              )
              break
            }

            default:
              // Might be a Turbopack message...
              if (!parsedData.type) {
                throw new Error(`unrecognized HMR message "${data}"`)
              }
          }

          // Turbopack messages
          switch (parsedData.type) {
            case 'turbopack-subscribe':
              subscribeToHmrEvents(client, parsedData.path)
              break

            case 'turbopack-unsubscribe':
              unsubscribeFromHmrEvents(client, parsedData.path)
              break

            default:
              if (!parsedData.event) {
                throw new Error(`unrecognized Turbopack HMR message "${data}"`)
              }
          }
        })

        const turbopackConnectedMessage: TurbopackConnectedMessage = {
          type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
          data: { sessionId },
        }
        sendToClient(client, turbopackConnectedMessage)

        const errors: CompilationError[] = []

        for (const entryIssues of currentEntryIssues.values()) {
          for (const issue of entryIssues.values()) {
            if (issue.severity !== 'warning') {
              errors.push({
                message: formatIssue(issue),
              })
            } else {
              printNonFatalIssue(issue)
            }
          }
        }

        if (devIndicatorServerState.disabledUntil < Date.now()) {
          devIndicatorServerState.disabledUntil = 0
        }

        ;(async function () {
          const versionInfo = await getVersionInfoCached()
          const devToolsConfig = await getDevToolsConfig(distDir)

          const syncMessage: SyncMessage = {
            type: HMR_MESSAGE_SENT_TO_BROWSER.SYNC,
            errors,
            warnings: [],
            hash: '',
            versionInfo,
            debug: {
              devtoolsFrontendUrl,
            },
            devIndicator: devIndicatorServerState,
            devToolsConfig,
          }

          sendToClient(client, syncMessage)

          if (requestId) {
            connectReactDebugChannel(requestId, sendToClient.bind(null, client))
          }
        })()
      })
    },

    send(action) {
      const payload = JSON.stringify(action)

      for (const client of [
        ...clientsWithoutRequestId,
        ...clientsByRequestId.values(),
      ]) {
        client.send(payload)
      }
    },

    sendToLegacyClients(action) {
      const payload = JSON.stringify(action)

      // Clients with a request ID are inferred App Router clients. If Cache
      // Components is not enabled, we consider those legacy clients. Pages
      // Router clients are also considered legacy clients. TODO: Maybe mark
      // clients as App Router / Pages Router clients explicitly, instead of
      // inferring it from the presence of a request ID.

      if (!nextConfig.cacheComponents) {
        for (const client of clientsByRequestId.values()) {
          client.send(payload)
        }
      }

      for (const client of clientsWithoutRequestId) {
        client.send(payload)
      }
    },

    setCacheStatus(
      status: ServerCacheStatus,
      htmlRequestId: string,
      requestId: string
    ): void {
      // Legacy clients don't have Cache Components.
      const client = clientsByRequestId.get(htmlRequestId)
      if (client !== undefined) {
        sendToClient(client, {
          type: HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR,
          state: status,
        })
      } else {
        // If the client is not connected, store the status so that we can send it
        // when the client connects.
        cacheStatusesByRequestId.set(requestId, status)
      }
    },

    setReactDebugChannel(debugChannel, htmlRequestId, requestId) {
      // Store the debug channel, regardless of whether the client is connected.
      setReactDebugChannel(requestId, debugChannel)

      // If the client is connected, we can connect the debug channel
      // immediately. Otherwise, we'll do that when the client connects.
      const client = clientsByRequestId.get(htmlRequestId)

      if (client) {
        connectReactDebugChannel(requestId, sendToClient.bind(null, client))
      }
    },

    setHmrServerError(_error) {
      // Not implemented yet.
    },
    clearHmrServerError() {
      // Not implemented yet.
    },
    async start() {},
    async getCompilationErrors(page) {
      const appEntryKey = getEntryKey('app', 'server', page)
      const pagesEntryKey = getEntryKey('pages', 'server', page)

      const topLevelIssues = currentTopLevelIssues.values()

      const thisEntryIssues =
        currentEntryIssues.get(appEntryKey) ??
        currentEntryIssues.get(pagesEntryKey)

      if (thisEntryIssues !== undefined && thisEntryIssues.size > 0) {
        // If there is an error related to the requesting page we display it instead of the first error
        return [...topLevelIssues, ...thisEntryIssues.values()]
          .map((issue) => {
            const formattedIssue = formatIssue(issue)
            if (issue.severity === 'warning') {
              printNonFatalIssue(issue)
              return null
            } else if (isWellKnownError(issue)) {
              Log.error(formattedIssue)
            }

            return new Error(formattedIssue)
          })
          .filter((error) => error !== null)
      }

      // Otherwise, return all errors across pages
      const errors = []
      for (const issue of topLevelIssues) {
        if (issue.severity !== 'warning') {
          errors.push(new Error(formatIssue(issue)))
        }
      }
      for (const entryIssues of currentEntryIssues.values()) {
        for (const issue of entryIssues.values()) {
          if (issue.severity !== 'warning') {
            const message = formatIssue(issue)
            errors.push(new Error(message))
          } else {
            printNonFatalIssue(issue)
          }
        }
      }
      return errors
    },
    async invalidate({
      // .env files or tsconfig/jsconfig change
      reloadAfterInvalidation,
    }) {
      if (reloadAfterInvalidation) {
        for (const [key, entrypoint] of currentWrittenEntrypoints) {
          clearRequireCache(key, entrypoint, { force: true })
        }

        await clearAllModuleContexts()
        this.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
          hash: String(++hmrHash),
        })
      }
    },
    async buildFallbackError() {
      // Not implemented yet.
    },
    async ensurePage({
      page: inputPage,
      // Unused parameters
      // clientOnly,
      appPaths,
      definition,
      isApp,
      url: requestUrl,
    }) {
      // When there is no route definition this is an internal file not a route the user added.
      // Middleware and instrumentation are handled in turbpack-utils.ts handleEntrypoints instead.
      if (!definition) {
        if (inputPage === '/middleware') return
        if (inputPage === '/src/middleware') return
        if (inputPage === '/instrumentation') return
        if (inputPage === '/src/instrumentation') return
      }

      return hotReloaderSpan
        .traceChild('ensure-page', {
          inputPage,
        })
        .traceAsyncFn(async () => {
          if (BLOCKED_PAGES.includes(inputPage) && inputPage !== '/_error') {
            return
          }

          await currentEntriesHandling

          // TODO We shouldn't look into the filesystem again. This should use the information from entrypoints
          let routeDef: Pick<
            RouteDefinition,
            'filename' | 'bundlePath' | 'page'
          > =
            definition ??
            (await findPagePathData(
              projectPath,
              inputPage,
              nextConfig.pageExtensions,
              opts.pagesDir,
              opts.appDir,
              !!nextConfig.experimental.globalNotFound
            ))

          // If the route is actually an app page route, then we should have access
          // to the app route definition, and therefore, the appPaths from it.
          if (!appPaths && definition && isAppPageRouteDefinition(definition)) {
            appPaths = definition.appPaths
          }

          let page = routeDef.page
          if (appPaths) {
            const normalizedPage = normalizeAppPath(page)

            // filter out paths that are not exact matches (e.g. catchall)
            const matchingAppPaths = appPaths.filter(
              (path) => normalizeAppPath(path) === normalizedPage
            )

            // the last item in the array is the root page, if there are parallel routes
            page = matchingAppPaths[matchingAppPaths.length - 1]
          }

          const pathname = definition?.pathname ?? inputPage

          if (page === '/_error') {
            let finishBuilding = startBuilding(pathname, requestUrl, false)
            try {
              await handlePagesErrorRoute({
                currentEntryIssues,
                entrypoints: currentEntrypoints,
                manifestLoader,
                devRewrites: opts.fsChecker.rewrites,
                productionRewrites: undefined,
                logErrors: true,
                hooks: {
                  subscribeToChanges,
                  handleWrittenEndpoint: (id, result, forceDeleteCache) => {
                    currentWrittenEntrypoints.set(id, result)
                    assetMapper.setPathsForKey(id, result.clientPaths)
                    return clearRequireCache(id, result, {
                      force: forceDeleteCache,
                    })
                  },
                },
              })
            } finally {
              finishBuilding()
            }
            return
          }

          const isInsideAppDir = routeDef.bundlePath.startsWith('app/')
          const isEntryMetadataRouteFile = isMetadataRouteFile(
            routeDef.filename.replace(opts.appDir || '', ''),
            nextConfig.pageExtensions,
            true
          )
          const normalizedAppPage = isEntryMetadataRouteFile
            ? normalizedPageToTurbopackStructureRoute(
                page,
                extname(routeDef.filename)
              )
            : page

          const route = isInsideAppDir
            ? currentEntrypoints.app.get(normalizedAppPage)
            : currentEntrypoints.page.get(page)

          if (!route) {
            // TODO: why is this entry missing in turbopack?
            if (page === '/middleware') return
            if (page === '/src/middleware') return
            if (page === '/proxy') return
            if (page === '/src/proxy') return
            if (page === '/instrumentation') return
            if (page === '/src/instrumentation') return

            throw new PageNotFoundError(`route not found ${page}`)
          }

          // We don't throw on ensureOpts.isApp === true for page-api
          // since this can happen when app pages make
          // api requests to page API routes.
          if (isApp && route.type === 'page') {
            throw new Error(`mis-matched route type: isApp && page for ${page}`)
          }

          const finishBuilding = startBuilding(pathname, requestUrl, false)
          try {
            await handleRouteType({
              dev,
              page,
              pathname,
              route,
              currentEntryIssues,
              entrypoints: currentEntrypoints,
              manifestLoader,
              readyIds,
              devRewrites: opts.fsChecker.rewrites,
              productionRewrites: undefined,
              logErrors: true,

              hooks: {
                subscribeToChanges,
                handleWrittenEndpoint: (id, result, forceDeleteCache) => {
                  currentWrittenEntrypoints.set(id, result)
                  assetMapper.setPathsForKey(id, result.clientPaths)
                  return clearRequireCache(id, result, {
                    force: forceDeleteCache,
                  })
                },
              },
            })
          } finally {
            finishBuilding()
          }
        })
    },
    close() {
      // Report MCP telemetry if MCP server is enabled
      recordMcpTelemetry(opts.telemetry)

      for (const wsClient of [
        ...clientsWithoutRequestId,
        ...clientsByRequestId.values(),
      ]) {
        // it's okay to not cleanly close these websocket connections, this is dev
        wsClient.terminate()
      }
      clientsWithoutRequestId.clear()
      clientsByRequestId.clear()
    },
  }

  handleEntrypointsSubscription().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  // Write empty manifests
  await currentEntriesHandling
  await manifestLoader.writeManifests({
    devRewrites: opts.fsChecker.rewrites,
    productionRewrites: undefined,
    entrypoints: currentEntrypoints,
  })

  async function handleProjectUpdates() {
    for await (const updateMessage of project.updateInfoSubscribe(30)) {
      switch (updateMessage.updateType) {
        case 'start': {
          hotReloader.send({ type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING })
          break
        }
        case 'end': {
          sendEnqueuedMessages()

          function addErrors(
            errorsMap: Map<string, CompilationError>,
            issues: EntryIssuesMap
          ) {
            for (const issueMap of issues.values()) {
              for (const [key, issue] of issueMap) {
                if (issue.severity === 'warning') continue
                if (errorsMap.has(key)) continue

                const message = formatIssue(issue)

                errorsMap.set(key, {
                  message,
                  details: issue.detail
                    ? renderStyledStringToErrorAnsi(issue.detail)
                    : undefined,
                })
              }
            }
          }

          const errors = new Map<string, CompilationError>()
          addErrors(errors, currentEntryIssues)

          for (const client of [
            ...clientsWithoutRequestId,
            ...clientsByRequestId.values(),
          ]) {
            const state = clientStates.get(client)
            if (!state) {
              continue
            }

            const clientErrors = new Map(errors)
            addErrors(clientErrors, state.clientIssues)

            sendToClient(client, {
              type: HMR_MESSAGE_SENT_TO_BROWSER.BUILT,
              hash: String(++hmrHash),
              errors: [...clientErrors.values()],
              warnings: [],
            })
          }

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
  }

  handleProjectUpdates().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  return hotReloader
}
