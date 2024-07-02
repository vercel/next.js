import type { Socket } from 'net'
import { mkdir, writeFile } from 'fs/promises'
import { join, extname } from 'path'

import ws from 'next/dist/compiled/ws'

import type { OutputState } from '../../build/output/store'
import { store as consoleStore } from '../../build/output/store'
import type {
  CompilationError,
  HMR_ACTION_TYPES,
  NextJsHotReloaderInterface,
  ReloadPageAction,
  SyncAction,
  TurbopackConnectedAction,
} from './hot-reloader-types'
import { HMR_ACTIONS_SENT_TO_BROWSER } from './hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../build/swc'
import {
  createDefineEnv,
  type Endpoint,
  type TurbopackResult,
  type WrittenEndpoint,
} from '../../build/swc'
import * as Log from '../../build/output/log'
import {
  getVersionInfo,
  matchNextPageBundleRequest,
} from './hot-reloader-webpack'
import { BLOCKED_PAGES } from '../../shared/lib/constants'
import { getOverlayMiddleware } from '../../client/components/react-dev-overlay/server/middleware-turbopack'
import { PageNotFoundError } from '../../shared/lib/utils'
import { debounce } from '../utils'
import {
  deleteAppClientCache,
  deleteCache,
} from '../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
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
  type EntryIssuesMap,
  formatIssue,
  getTurbopackJsConfig,
  handleEntrypoints,
  handlePagesErrorRoute,
  handleRouteType,
  hasEntrypointForKey,
  msToNs,
  processIssues,
  type ReadyIds,
  renderStyledStringToErrorAnsi,
  type SendHmr,
  type StartBuilding,
  processTopLevelIssues,
  type TopLevelIssuesMap,
  isWellKnownError,
  printNonFatalIssue,
  normalizedPageToTurbopackStructureRoute,
} from './turbopack-utils'
import {
  propagateServerField,
  type ServerFields,
  type SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import { TurbopackManifestLoader } from './turbopack/manifest-loader'
import type { Entrypoints } from './turbopack/types'
import { findPagePathData } from './on-demand-entry-handler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import {
  type EntryKey,
  getEntryKey,
  splitEntryKey,
} from './turbopack/entry-key'
import { FAST_REFRESH_RUNTIME_RELOAD } from './messages'
import { generateEncryptionKeyBase64 } from '../app-render/encryption-utils'
import { isAppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

const wsServer = new ws.Server({ noServer: true })
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

export async function createHotReloaderTurbopack(
  opts: SetupOpts,
  serverFields: ServerFields,
  distDir: string
): Promise<NextJsHotReloaderInterface> {
  const buildId = 'development'
  const { nextConfig, dir } = opts

  const { loadBindings } =
    require('../../build/swc') as typeof import('../../build/swc')

  let bindings = await loadBindings()

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

  const encryptionKey = await generateEncryptionKeyBase64(true)
  const project = await bindings.turbo.createProject(
    {
      projectPath: dir,
      rootPath: opts.nextConfig.experimental.outputFileTracingRoot || dir,
      nextConfig: opts.nextConfig,
      jsConfig: await getTurbopackJsConfig(dir, nextConfig),
      watch: true,
      dev: true,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        // TODO: Implement
        clientRouterFilters: undefined,
        config: nextConfig,
        dev: true,
        distDir,
        fetchCacheKeyPrefix: opts.nextConfig.experimental.fetchCacheKeyPrefix,
        hasRewrites,
        // TODO: Implement
        middlewareMatchers: undefined,
      }),
      buildId,
      encryptionKey,
      previewProps: opts.fsChecker.prerenderManifest.preview,
    },
    {
      memoryLimit: opts.nextConfig.experimental.turbo?.memoryLimit,
    }
  )
  opts.onCleanup(() => project.onExit())
  const entrypointsSubscription = project.entrypointsSubscribe()

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
    writtenEndpoint: WrittenEndpoint
  ): void {
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
        serverPathState.set(key, contentHash)
        serverPathState.set(path, contentHash)
      } else {
        if (!localHash) {
          serverPathState.set(key, contentHash)
        }
        if (!globalHash) {
          serverPathState.set(path, contentHash)
        }
      }
    }

    if (!hasChange) {
      return
    }

    const hasAppPaths = writtenEndpoint.serverPaths.some(({ path: p }) =>
      p.startsWith('server/app')
    )

    if (hasAppPaths) {
      deleteAppClientCache()
    }

    const serverPaths = writtenEndpoint.serverPaths.map(({ path: p }) =>
      join(distDir, p)
    )

    for (const file of serverPaths) {
      clearModuleContext(file)
      deleteCache(file)
    }

    return
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

  const clients = new Set<ws>()
  const clientStates = new WeakMap<ws, ClientState>()

  function sendToClient(client: ws, payload: HMR_ACTION_TYPES) {
    client.send(JSON.stringify(payload))
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

    for (const client of clients) {
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

      for (const payload of state.hmrPayloads.values()) {
        sendToClient(client, payload)
      }
      state.hmrPayloads.clear()

      if (state.turbopackUpdates.length > 0) {
        sendToClient(client, {
          action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
          data: state.turbopackUpdates,
        })
        state.turbopackUpdates.length = 0
      }
    }
  }
  const sendEnqueuedMessagesDebounce = debounce(sendEnqueuedMessages, 2)

  const sendHmr: SendHmr = (id: string, payload: HMR_ACTION_TYPES) => {
    for (const client of clients) {
      clientStates.get(client)?.hmrPayloads.set(id, payload)
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

    for (const client of clients) {
      clientStates.get(client)?.turbopackUpdates.push(payload)
    }

    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  async function subscribeToChanges(
    key: EntryKey,
    includeIssues: boolean,
    endpoint: Endpoint,
    makePayload: (
      change: TurbopackResult
    ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
  ) {
    if (changeSubscriptions.has(key)) {
      return
    }

    const { side } = splitEntryKey(key)

    const changedPromise = endpoint[`${side}Changed`](includeIssues)
    changeSubscriptions.set(key, changedPromise)
    const changed = await changedPromise

    for await (const change of changed) {
      processIssues(currentEntryIssues, key, change, false, true)
      const payload = await makePayload(change)
      if (payload) {
        sendHmr(key, payload)
      }
    }
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
      const reloadAction: ReloadPageAction = {
        action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE,
      }
      sendToClient(client, reloadAction)
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

      processTopLevelIssues(currentTopLevelIssues, entrypoints)

      await handleEntrypoints({
        entrypoints,

        currentEntrypoints,

        currentEntryIssues,
        manifestLoader,
        nextConfig: opts.nextConfig,
        rewrites: opts.fsChecker.rewrites,
        logErrors: true,

        dev: {
          assetMapper,
          changeSubscriptions,
          clients,
          clientStates,
          serverFields,

          hooks: {
            handleWrittenEndpoint: (id, result) => {
              clearRequireCache(id, result)
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
  const overlayMiddleware = getOverlayMiddleware(project)
  const versionInfoPromise = getVersionInfo(
    isTestMode || opts.telemetry.isEnabled
  )

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
        const clientIssues: EntryIssuesMap = new Map()
        const subscriptions: Map<string, AsyncIterator<any>> = new Map()

        clients.add(client)
        clientStates.set(client, {
          clientIssues,
          hmrPayloads: new Map(),
          turbopackUpdates: [],
          subscriptions,
        })

        client.on('close', () => {
          // Remove active subscriptions
          for (const subscription of subscriptions.values()) {
            subscription.return?.()
          }
          clientStates.delete(client)
          clients.delete(client)
        })

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

        const turbopackConnected: TurbopackConnectedAction = {
          action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        }
        sendToClient(client, turbopackConnected)

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

        ;(async function () {
          const versionInfo = await versionInfoPromise

          const sync: SyncAction = {
            action: HMR_ACTIONS_SENT_TO_BROWSER.SYNC,
            errors,
            warnings: [],
            hash: '',
            versionInfo,
          }

          sendToClient(client, sync)
        })()
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
    async start() {},
    async stop() {
      // Not implemented yet.
    },
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
        await clearAllModuleContexts()
        this.send({
          action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
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
      if (BLOCKED_PAGES.includes(inputPage) && inputPage !== '/_error') {
        return
      }

      let routeDef: Pick<RouteDefinition, 'filename' | 'bundlePath' | 'page'> =
        definition ??
        (await findPagePathData(
          dir,
          inputPage,
          nextConfig.pageExtensions,
          opts.pagesDir,
          opts.appDir
        ))

      const page = routeDef.page
      const pathname = definition?.pathname ?? inputPage

      let pages = appPaths ?? [page]

      // If the route is actually an app page route, then we should have access
      // to the app route definition, and therefore, the appPaths from it.
      if (!appPaths && definition && isAppPageRouteDefinition(definition)) {
        pages = definition.appPaths
      }

      if (page === '/_error') {
        let finishBuilding = startBuilding(pathname, requestUrl, false)
        try {
          await handlePagesErrorRoute({
            currentEntryIssues,
            entrypoints: currentEntrypoints,
            manifestLoader,
            rewrites: opts.fsChecker.rewrites,
            logErrors: true,

            hooks: {
              subscribeToChanges,
              handleWrittenEndpoint: (id, result) => {
                clearRequireCache(id, result)
                assetMapper.setPathsForKey(id, result.clientPaths)
              },
            },
          })
        } finally {
          finishBuilding()
        }
        return
      }

      await currentEntriesHandling

      const isInsideAppDir = routeDef.bundlePath.startsWith('app/')

      const finishBuilding = startBuilding(pathname, requestUrl, false)
      try {
        // we need to build all parallel routes, so we loop over them here

        /* eslint-disable-next-line @typescript-eslint/no-shadow -- intentionally shadowed*/
        for (const page of pages) {
          const normalizedAppPage = normalizedPageToTurbopackStructureRoute(
            page,
            extname(routeDef.filename)
          )
          const route = isInsideAppDir
            ? currentEntrypoints.app.get(normalizedAppPage)
            : currentEntrypoints.page.get(page)

          if (!route) {
            // TODO: why is this entry missing in turbopack?
            if (page === '/middleware') return
            if (page === '/src/middleware') return
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

          await handleRouteType({
            dev: true,
            page,
            pathname,
            route,
            currentEntryIssues,
            entrypoints: currentEntrypoints,
            manifestLoader,
            readyIds,
            rewrites: opts.fsChecker.rewrites,
            logErrors: true,

            hooks: {
              subscribeToChanges,
              handleWrittenEndpoint: (id, result) => {
                clearRequireCache(id, result)
                assetMapper.setPathsForKey(id, result.clientPaths)
              },
            },
          })
        }
      } finally {
        finishBuilding()
      }
    },
  }

  handleEntrypointsSubscription().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  // Write empty manifests
  await currentEntriesHandling
  await manifestLoader.writeManifests({
    rewrites: opts.fsChecker.rewrites,
    pageEntrypoints: currentEntrypoints.page,
  })

  async function handleProjectUpdates() {
    for await (const updateMessage of project.updateInfoSubscribe(30)) {
      switch (updateMessage.updateType) {
        case 'start': {
          hotReloader.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING })
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

          for (const client of clients) {
            const state = clientStates.get(client)
            if (!state) {
              continue
            }

            const clientErrors = new Map(errors)
            addErrors(clientErrors, state.clientIssues)

            sendToClient(client, {
              action: HMR_ACTIONS_SENT_TO_BROWSER.BUILT,
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
