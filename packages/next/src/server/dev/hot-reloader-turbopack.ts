import type { Socket } from 'net'
import type { OutputState } from '../../build/output/store'
import type {
  CompilationError,
  HMR_ACTION_TYPES,
  NextJsHotReloaderInterface,
  ReloadPageAction,
  SyncAction,
  TurbopackConnectedAction,
} from './hot-reloader-types'

import ws from 'next/dist/compiled/ws'
import { createDefineEnv } from '../../build/swc'
import { join } from 'path'
import * as Log from '../../build/output/log'
import {
  getVersionInfo,
  matchNextPageBundleRequest,
} from './hot-reloader-webpack'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { store as consoleStore } from '../../build/output/store'
import { getOverlayMiddleware } from '../../client/components/react-dev-overlay/server/middleware-turbopack'
import { mkdir, writeFile } from 'fs/promises'
import { PageNotFoundError } from '../../shared/lib/utils'
import { HMR_ACTIONS_SENT_TO_BROWSER } from './hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../build/swc'
import { debounce } from '../utils'
import {
  deleteAppClientCache,
  deleteCache,
} from '../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { normalizeMetadataRoute } from '../../lib/metadata/get-metadata-route'
import {
  clearModuleContext,
  clearAllModuleContexts,
} from '../lib/render-server'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { trace } from '../../trace'
import type { VersionInfo } from './parse-version-info'
import {
  getTurbopackJsConfig,
  type BuildManifests,
  type AppBuildManifests,
  type PagesManifests,
  type AppPathsManifests,
  type MiddlewareManifests,
  type ActionManifests,
  type FontManifests,
  type LoadableManifests,
  loadMiddlewareManifest,
  writeManifests,
  loadBuildManifest,
  loadPagesManifest,
  loadFontManifest,
  type CurrentEntrypoints,
  type CurrentIssues,
  processIssues,
  msToNs,
  formatIssue,
  renderStyledStringToErrorAnsi,
  type GlobalEntrypoints,
  type HandleRequireCacheClearing,
  type ReadyIds,
  type ChangeSubscription,
  handleRouteType,
} from './turbopack-utils'
import {
  propagateServerField,
  type ServerFields,
  type SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'

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

  const project = await bindings.turbo.createProject({
    projectPath: dir,
    rootPath: opts.nextConfig.experimental.outputFileTracingRoot || dir,
    nextConfig: opts.nextConfig,
    jsConfig: await getTurbopackJsConfig(dir, nextConfig),
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
  })
  const entrypointsSubscription = project.entrypointsSubscribe()
  const currentEntrypoints: CurrentEntrypoints = new Map()
  const changeSubscriptions: Map<
    string,
    Promise<AsyncIterator<any>>
  > = new Map()
  let prevMiddleware: boolean | undefined = undefined

  const globalEntrypoints: GlobalEntrypoints = {
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

  const currentIssues: CurrentIssues = new Map()
  const serverPathState = new Map<string, string>()

  const handleRequireCacheClearing: HandleRequireCacheClearing = (
    id,
    result
  ) => {
    // Figure out if the server files have changed
    let hasChange = false
    for (const { path, contentHash } of result.serverPaths) {
      // We ignore source maps
      if (path.endsWith('.map')) continue
      const key = `${id}:${path}`
      const localHash = serverPathState.get(key)
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

    const hasAppPaths = result.serverPaths.some(({ path: p }) =>
      p.startsWith('server/app')
    )

    if (hasAppPaths) {
      deleteAppClientCache()
    }

    const serverPaths = result.serverPaths.map(({ path: p }) =>
      join(distDir, p)
    )

    for (const file of serverPaths) {
      clearModuleContext(file)
      deleteCache(file)
    }

    return
  }

  const buildingIds = new Set()
  const readyIds: ReadyIds = new Set()

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
    for (const [, issueMap] of currentIssues) {
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

  function sendHmr(id: string, payload: HMR_ACTION_TYPES) {
    hmrPayloads.set(`${id}`, payload)
    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  function sendTurbopackMessage(payload: TurbopackUpdate) {
    turbopackUpdates.push(payload)
    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  const buildManifests: BuildManifests = new Map()
  const appBuildManifests: AppBuildManifests = new Map()
  const pagesManifests: PagesManifests = new Map()
  const appPathsManifests: AppPathsManifests = new Map()
  const middlewareManifests: MiddlewareManifests = new Map()
  const actionManifests: ActionManifests = new Map()
  const fontManifests: FontManifests = new Map()
  const loadableManifests: LoadableManifests = new Map()

  const clientToHmrSubscription: Map<
    ws,
    Map<string, AsyncIterator<any>>
  > = new Map()

  const clients = new Set<ws>()

  const changeSubscription: ChangeSubscription = async (
    page,
    type,
    includeIssues,
    endpoint,
    makePayload
  ) => {
    const key = `${page} (${type})`
    if (!endpoint || changeSubscriptions.has(key)) return

    const changedPromise = endpoint[`${type}Changed`](includeIssues)
    changeSubscriptions.set(key, changedPromise)
    const changed = await changedPromise

    for await (const change of changed) {
      processIssues(currentIssues, page, change)
      const payload = await makePayload(page, change)
      if (payload) {
        sendHmr(key, payload)
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
    currentIssues.delete(key)
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
        processIssues(currentIssues, id, data)
        if (data.type !== 'issues') {
          sendTurbopackMessage(data)
        }
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
    async function handleEntrypointsSubscription() {
      for await (const entrypoints of entrypointsSubscription) {
        if (!currentEntriesHandlingResolve) {
          currentEntriesHandling = new Promise(
            // eslint-disable-next-line no-loop-func
            (resolve) => (currentEntriesHandlingResolve = resolve)
          )
        }
        globalEntrypoints.app = entrypoints.pagesAppEndpoint
        globalEntrypoints.document = entrypoints.pagesDocumentEndpoint
        globalEntrypoints.error = entrypoints.pagesErrorEndpoint

        currentEntrypoints.clear()

        for (const [pathname, route] of entrypoints.routes) {
          switch (route.type) {
            case 'page':
            case 'page-api':
            case 'app-page':
            case 'app-route': {
              currentEntrypoints.set(pathname, route)
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

          if (!currentEntrypoints.has(pathname)) {
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
          sendHmr('middleware', {
            event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
          })
        } else if (prevMiddleware === false && middleware) {
          // Went from no middleware to middleware
          sendHmr('middleware', {
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
            const writtenEndpoint = await instrumentation[prop].writeToDisk()
            handleRequireCacheClearing(displayName, writtenEndpoint)
            processIssues(currentIssues, name, writtenEndpoint)
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
          await loadMiddlewareManifest(
            distDir,
            middlewareManifests,
            'instrumentation',
            'instrumentation'
          )
          await writeManifests({
            rewrites: opts.fsChecker.rewrites,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints,
          })

          serverFields.actualInstrumentationHookFile = '/instrumentation'
          await propagateServerField(
            opts,
            'actualInstrumentationHookFile',
            serverFields.actualInstrumentationHookFile
          )
        } else {
          serverFields.actualInstrumentationHookFile = undefined
          await propagateServerField(
            opts,
            'actualInstrumentationHookFile',
            serverFields.actualInstrumentationHookFile
          )
        }
        if (middleware) {
          const processMiddleware = async () => {
            const writtenEndpoint = await middleware.endpoint.writeToDisk()
            handleRequireCacheClearing('middleware', writtenEndpoint)
            processIssues(currentIssues, 'middleware', writtenEndpoint)
            await loadMiddlewareManifest(
              distDir,
              middlewareManifests,
              'middleware',
              'middleware'
            )
            serverFields.middleware = {
              match: null as any,
              page: '/',
              matchers:
                middlewareManifests.get('middleware')?.middleware['/'].matchers,
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
                opts,
                'actualMiddlewareFile',
                serverFields.actualMiddlewareFile
              )
              await propagateServerField(
                opts,
                'middleware',
                serverFields.middleware
              )
              await writeManifests({
                rewrites: opts.fsChecker.rewrites,
                distDir,
                buildManifests,
                appBuildManifests,
                pagesManifests,
                appPathsManifests,
                middlewareManifests,
                actionManifests,
                fontManifests,
                loadableManifests,
                currentEntrypoints,
              })

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
          opts,
          'actualMiddlewareFile',
          serverFields.actualMiddlewareFile
        )
        await propagateServerField(opts, 'middleware', serverFields.middleware)

        currentEntriesHandlingResolve!()
        currentEntriesHandlingResolve = undefined
      }
    }

    handleEntrypointsSubscription().catch((err) => {
      console.error(err)
      process.exit(1)
    })
  } catch (e) {
    console.error(e)
  }

  // Write empty manifests
  await mkdir(join(distDir, 'server'), { recursive: true })
  await mkdir(join(distDir, 'static/development'), { recursive: true })
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
  await currentEntriesHandling
  await writeManifests({
    rewrites: opts.fsChecker.rewrites,
    distDir,
    buildManifests,
    appBuildManifests,
    pagesManifests,
    appPathsManifests,
    middlewareManifests,
    actionManifests,
    fontManifests,
    loadableManifests,
    currentEntrypoints,
  })
  const overlayMiddleware = getOverlayMiddleware(project)
  const versionInfo: VersionInfo = await getVersionInfo(
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
                throw new Error(`unrecognized Turbopack HMR message "${data}"`)
              }
          }
        })

        const turbopackConnected: TurbopackConnectedAction = {
          action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        }
        client.send(JSON.stringify(turbopackConnected))

        const errors = []
        for (const pageIssues of currentIssues.values()) {
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
    async start() {},
    async stop() {
      // Not implemented yet.
    },
    async getCompilationErrors(page) {
      const thisPageIssues = currentIssues.get(page)
      if (thisPageIssues !== undefined && thisPageIssues.size > 0) {
        // If there is an error related to the requesting page we display it instead of the first error
        return [...thisPageIssues.values()].map(
          (issue) => new Error(formatIssue(issue))
        )
      }

      // Otherwise, return all errors across pages
      const errors = []
      for (const pageIssues of currentIssues.values()) {
        for (const issue of pageIssues.values()) {
          errors.push(new Error(formatIssue(issue)))
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
      // appPaths,
      definition,
      isApp,
      url: requestUrl,
    }) {
      const page = definition?.pathname ?? inputPage

      if (page === '/_error') {
        let finishBuilding = startBuilding(page, requestUrl)
        try {
          if (globalEntrypoints.app) {
            const writtenEndpoint = await globalEntrypoints.app.writeToDisk()
            handleRequireCacheClearing('_app', writtenEndpoint)
            processIssues(currentIssues, '_app', writtenEndpoint)
          }
          await loadBuildManifest(distDir, buildManifests, '_app')
          await loadPagesManifest(distDir, pagesManifests, '_app')
          await loadFontManifest(distDir, fontManifests, '_app')

          if (globalEntrypoints.document) {
            const writtenEndpoint =
              await globalEntrypoints.document.writeToDisk()
            handleRequireCacheClearing('_document', writtenEndpoint)
            changeSubscription(
              '_document',
              'server',
              false,
              globalEntrypoints.document,
              () => {
                return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
              }
            )
            processIssues(currentIssues, '_document', writtenEndpoint)
          }
          await loadPagesManifest(distDir, pagesManifests, '_document')

          if (globalEntrypoints.error) {
            const writtenEndpoint = await globalEntrypoints.error.writeToDisk()
            handleRequireCacheClearing('_error', writtenEndpoint)
            processIssues(currentIssues, page, writtenEndpoint)
          }
          await loadBuildManifest(distDir, buildManifests, '_error')
          await loadPagesManifest(distDir, pagesManifests, '_error')
          await loadFontManifest(distDir, fontManifests, '_error')

          await writeManifests({
            rewrites: opts.fsChecker.rewrites,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints,
          })
        } finally {
          finishBuilding()
        }
        return
      }
      await currentEntriesHandling
      const route =
        currentEntrypoints.get(page) ??
        currentEntrypoints.get(
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

      // We don't throw on ensureOpts.isApp === true for page-api
      // since this can happen when app pages make
      // api requests to page API routes.
      if (isApp && route.type === 'page') {
        throw new Error(`mis-matched route type: isApp && page for ${page}`)
      }

      const finishBuilding = startBuilding(page, requestUrl)
      try {
        await handleRouteType({
          rewrites: opts.fsChecker.rewrites,
          distDir,
          globalEntrypoints,
          currentIssues,
          buildManifests,
          appBuildManifests,
          pagesManifests,
          appPathsManifests,
          middlewareManifests,
          actionManifests,
          fontManifests,
          loadableManifests,
          currentEntrypoints,
          handleRequireCacheClearing,
          changeSubscription,
          readyIds,
          page,
          route,
        })
      } finally {
        finishBuilding()
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
          for (const [, issueMap] of currentIssues) {
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
