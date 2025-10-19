import type {
  ServerFields,
  SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import type {
  Issue,
  TurbopackResult,
  Endpoint,
  RawEntrypoints,
  Update as TurbopackUpdate,
  WrittenEndpoint,
} from '../../build/swc/types'
import {
  type HmrMessageSentToBrowser,
  HMR_MESSAGE_SENT_TO_BROWSER,
} from './hot-reloader-types'
import * as Log from '../../build/output/log'
import type { PropagateToWorkersField } from '../lib/router-utils/types'
import type { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import type { AppRoute, Entrypoints, PageRoute } from '../../build/swc/types'
import {
  type EntryKey,
  getEntryKey,
  splitEntryKey,
} from '../../shared/lib/turbopack/entry-key'
import type ws from 'next/dist/compiled/ws'
import { isMetadataRoute } from '../../lib/metadata/is-metadata-route'
import type { CustomRoutes } from '../../lib/load-custom-routes'
import {
  formatIssue,
  getIssueKey,
  isRelevantWarning,
  processIssues,
  renderStyledStringToErrorAnsi,
  type EntryIssuesMap,
  type TopLevelIssuesMap,
} from '../../shared/lib/turbopack/utils'
import { MIDDLEWARE_FILENAME, PROXY_FILENAME } from '../../lib/constants'

const onceErrorSet = new Set()
/**
 * Check if given issue is a warning to be display only once.
 * This mimics behavior of get-page-static-info's warnOnce.
 * @param issue
 * @returns
 */
function shouldEmitOnceWarning(issue: Issue): boolean {
  const { severity, title, stage } = issue
  if (severity === 'warning' && title.value === 'Invalid page configuration') {
    if (onceErrorSet.has(issue)) {
      return false
    }
    onceErrorSet.add(issue)
  }
  if (
    severity === 'warning' &&
    stage === 'config' &&
    renderStyledStringToErrorAnsi(issue.title).includes("can't be external")
  ) {
    if (onceErrorSet.has(issue)) {
      return false
    }
    onceErrorSet.add(issue)
  }

  return true
}

/// Print out an issue to the console which should not block
/// the build by throwing out or blocking error overlay.
export function printNonFatalIssue(issue: Issue) {
  if (isRelevantWarning(issue) && shouldEmitOnceWarning(issue)) {
    Log.warn(formatIssue(issue))
  }
}

export function processTopLevelIssues(
  currentTopLevelIssues: TopLevelIssuesMap,
  result: TurbopackResult
) {
  currentTopLevelIssues.clear()

  for (const issue of result.issues) {
    const issueKey = getIssueKey(issue)
    currentTopLevelIssues.set(issueKey, issue)
  }
}

const MILLISECONDS_IN_NANOSECOND = BigInt(1_000_000)

export function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * MILLISECONDS_IN_NANOSECOND
}

export type ChangeSubscriptions = Map<
  EntryKey,
  Promise<AsyncIterableIterator<TurbopackResult>>
>

export type HandleWrittenEndpoint = (
  key: EntryKey,
  result: TurbopackResult<WrittenEndpoint>,
  forceDeleteCache: boolean
) => boolean

export type StartChangeSubscription = (
  key: EntryKey,
  includeIssues: boolean,
  endpoint: Endpoint,
  createMessage: (
    change: TurbopackResult,
    hash: string
  ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void,
  onError?: (
    e: Error
  ) => Promise<HmrMessageSentToBrowser> | HmrMessageSentToBrowser | void
) => Promise<void>

export type StopChangeSubscription = (key: EntryKey) => Promise<void>

export type SendHmr = (id: string, message: HmrMessageSentToBrowser) => void

export type StartBuilding = (
  id: string,
  requestUrl: string | undefined,
  forceRebuild: boolean
) => () => void

export type ReadyIds = Set<string>

export type ClientState = {
  clientIssues: EntryIssuesMap
  messages: Map<string, HmrMessageSentToBrowser>
  turbopackUpdates: TurbopackUpdate[]
  subscriptions: Map<string, AsyncIterator<any>>
}

export type ClientStateMap = WeakMap<ws, ClientState>

// hooks only used by the dev server.
type HandleRouteTypeHooks = {
  handleWrittenEndpoint: HandleWrittenEndpoint
  subscribeToChanges: StartChangeSubscription
}

export async function handleRouteType({
  dev,
  page,
  pathname,
  route,
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  readyIds,
  devRewrites,
  productionRewrites,
  hooks,
  logErrors,
}: {
  dev: boolean
  page: string
  pathname: string
  route: PageRoute | AppRoute

  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean

  readyIds?: ReadyIds // dev

  hooks?: HandleRouteTypeHooks // dev
}) {
  const shouldCreateWebpackStats = process.env.TURBOPACK_STATS != null

  switch (route.type) {
    case 'page': {
      const clientKey = getEntryKey('pages', 'client', page)
      const serverKey = getEntryKey('pages', 'server', page)

      try {
        // In the best case scenario, Turbopack chunks document, app, page separately in that order,
        // so it can happen that the chunks of document change, but the chunks of app and page
        // don't. We still need to reload the page chunks in that case though, otherwise the version
        // of the document or app component export from the pages template is stale.
        let documentOrAppChanged = false
        if (entrypoints.global.app) {
          const key = getEntryKey('pages', 'server', '_app')

          const writtenEndpoint = await entrypoints.global.app.writeToDisk()
          documentOrAppChanged ||=
            hooks?.handleWrittenEndpoint(key, writtenEndpoint, false) ?? false
          processIssues(
            currentEntryIssues,
            key,
            writtenEndpoint,
            false,
            logErrors
          )
        }
        await manifestLoader.loadBuildManifest('_app')
        await manifestLoader.loadPagesManifest('_app')

        if (entrypoints.global.document) {
          const key = getEntryKey('pages', 'server', '_document')

          const writtenEndpoint =
            await entrypoints.global.document.writeToDisk()
          documentOrAppChanged ||=
            hooks?.handleWrittenEndpoint(key, writtenEndpoint, false) ?? false
          processIssues(
            currentEntryIssues,
            key,
            writtenEndpoint,
            false,
            logErrors
          )
        }
        await manifestLoader.loadPagesManifest('_document')

        const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
        hooks?.handleWrittenEndpoint(
          serverKey,
          writtenEndpoint,
          documentOrAppChanged
        )

        const type = writtenEndpoint?.type

        await manifestLoader.loadClientBuildManifest(page)
        await manifestLoader.loadBuildManifest(page)
        await manifestLoader.loadPagesManifest(page)
        if (type === 'edge') {
          await manifestLoader.loadMiddlewareManifest(page, 'pages')
        } else {
          manifestLoader.deleteMiddlewareManifest(serverKey)
        }
        await manifestLoader.loadFontManifest('/_app', 'pages')
        await manifestLoader.loadFontManifest(page, 'pages')

        if (shouldCreateWebpackStats) {
          await manifestLoader.loadWebpackStats(page, 'pages')
        }

        manifestLoader.writeManifests({
          devRewrites,
          productionRewrites,
          entrypoints,
        })

        processIssues(
          currentEntryIssues,
          serverKey,
          writtenEndpoint,
          false,
          logErrors
        )
      } finally {
        if (dev) {
          // TODO subscriptions should only be caused by the WebSocket connections
          // otherwise we don't known when to unsubscribe and this leaking
          hooks?.subscribeToChanges(
            serverKey,
            false,
            route.dataEndpoint,
            () => {
              // Report the next compilation again
              readyIds?.delete(pathname)
              return {
                type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
                pages: [page],
              }
            },
            (e) => {
              return {
                type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
                data: `error in ${page} data subscription: ${e}`,
              }
            }
          )
          hooks?.subscribeToChanges(
            clientKey,
            false,
            route.htmlEndpoint,
            () => {
              return {
                type: HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES,
              }
            },
            (e) => {
              return {
                type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
                data: `error in ${page} html subscription: ${e}`,
              }
            }
          )
          if (entrypoints.global.document) {
            hooks?.subscribeToChanges(
              getEntryKey('pages', 'server', '_document'),
              false,
              entrypoints.global.document,
              () => {
                return {
                  type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
                  data: '_document has changed (page route)',
                }
              },
              (e) => {
                return {
                  type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
                  data: `error in _document subscription (page route): ${e}`,
                }
              }
            )
          }
        }
      }

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const writtenEndpoint = await route.endpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint, false)

      const type = writtenEndpoint.type

      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)

      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint, false)

      if (dev) {
        // TODO subscriptions should only be caused by the WebSocket connections
        // otherwise we don't known when to unsubscribe and this leaking
        hooks?.subscribeToChanges(
          key,
          true,
          route.rscEndpoint,
          (change, hash) => {
            if (change.issues.some((issue) => issue.severity === 'error')) {
              // Ignore any updates that has errors
              // There will be another update without errors eventually
              return
            }
            // Report the next compilation again
            readyIds?.delete(pathname)
            return {
              type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
              hash,
            }
          },
          (e) => {
            return {
              type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
              data: `error in ${page} app-page subscription: ${e}`,
            }
          }
        )
      }

      const type = writtenEndpoint.type

      if (type === 'edge') {
        manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      manifestLoader.loadBuildManifest(page, 'app')
      manifestLoader.loadAppPathsManifest(page)
      manifestLoader.loadActionManifest(page)
      manifestLoader.loadFontManifest(page, 'app')

      if (shouldCreateWebpackStats) {
        manifestLoader.loadWebpackStats(page, 'app')
      }

      manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint, dev, logErrors)

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)

      const writtenEndpoint = await route.endpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint, false)

      const type = writtenEndpoint.type

      manifestLoader.loadAppPathsManifest(page)

      if (type === 'edge') {
        manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })
      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}

/**
 * Maintains a mapping between entrypoins and the corresponding client asset paths.
 */
export class AssetMapper {
  private entryMap: Map<EntryKey, Set<string>> = new Map()
  private assetMap: Map<string, Set<EntryKey>> = new Map()

  /**
   * Overrides asset paths for a key and updates the mapping from path to key.
   *
   * @param key
   * @param assetPaths asset paths relative to the .next directory
   */
  setPathsForKey(key: EntryKey, assetPaths: string[]): void {
    this.delete(key)

    const newAssetPaths = new Set(assetPaths)
    this.entryMap.set(key, newAssetPaths)

    for (const assetPath of newAssetPaths) {
      let assetPathKeys = this.assetMap.get(assetPath)
      if (!assetPathKeys) {
        assetPathKeys = new Set()
        this.assetMap.set(assetPath, assetPathKeys)
      }

      assetPathKeys!.add(key)
    }
  }

  /**
   * Deletes the key and any asset only referenced by this key.
   *
   * @param key
   */
  delete(key: EntryKey) {
    for (const assetPath of this.getAssetPathsByKey(key)) {
      const assetPathKeys = this.assetMap.get(assetPath)

      assetPathKeys?.delete(key)

      if (!assetPathKeys?.size) {
        this.assetMap.delete(assetPath)
      }
    }

    this.entryMap.delete(key)
  }

  getAssetPathsByKey(key: EntryKey): string[] {
    return Array.from(this.entryMap.get(key) ?? [])
  }

  getKeysByAsset(path: string): EntryKey[] {
    return Array.from(this.assetMap.get(path) ?? [])
  }

  keys(): IterableIterator<EntryKey> {
    return this.entryMap.keys()
  }
}

export function hasEntrypointForKey(
  entrypoints: Entrypoints,
  key: EntryKey,
  assetMapper: AssetMapper | undefined
): boolean {
  const { type, page } = splitEntryKey(key)

  switch (type) {
    case 'app':
      return entrypoints.app.has(page)
    case 'pages':
      switch (page) {
        case '_app':
          return entrypoints.global.app != null
        case '_document':
          return entrypoints.global.document != null
        case '_error':
          return entrypoints.global.error != null
        default:
          return entrypoints.page.has(page)
      }
    case 'root':
      switch (page) {
        case 'middleware':
          return entrypoints.global.middleware != null
        case 'instrumentation':
          return entrypoints.global.instrumentation != null
        default:
          return false
      }
    case 'assets':
      if (!assetMapper) {
        return false
      }

      return assetMapper
        .getKeysByAsset(page)
        .some((pageKey) =>
          hasEntrypointForKey(entrypoints, pageKey, assetMapper)
        )
    default: {
      // validation that we covered all cases, this should never run.
      const _: never = type
      return false
    }
  }
}

// hooks only used by the dev server.
type HandleEntrypointsHooks = {
  handleWrittenEndpoint: HandleWrittenEndpoint
  propagateServerField: (
    field: PropagateToWorkersField,
    args: any
  ) => Promise<void>
  sendHmr: SendHmr
  startBuilding: StartBuilding
  subscribeToChanges: StartChangeSubscription
  unsubscribeFromChanges: StopChangeSubscription
  unsubscribeFromHmrEvents: (client: ws, id: string) => void
}

type HandleEntrypointsDevOpts = {
  assetMapper: AssetMapper
  changeSubscriptions: ChangeSubscriptions
  clients: Array<ws>
  clientStates: ClientStateMap
  serverFields: ServerFields

  hooks: HandleEntrypointsHooks
}

export async function handleEntrypoints({
  entrypoints,

  currentEntrypoints,

  currentEntryIssues,
  manifestLoader,
  devRewrites,
  logErrors,
  dev,
}: {
  entrypoints: TurbopackResult<RawEntrypoints>

  currentEntrypoints: Entrypoints

  currentEntryIssues: EntryIssuesMap
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean

  dev: HandleEntrypointsDevOpts
}) {
  currentEntrypoints.global.app = entrypoints.pagesAppEndpoint
  currentEntrypoints.global.document = entrypoints.pagesDocumentEndpoint
  currentEntrypoints.global.error = entrypoints.pagesErrorEndpoint

  currentEntrypoints.global.instrumentation = entrypoints.instrumentation

  currentEntrypoints.page.clear()
  currentEntrypoints.app.clear()

  for (const [pathname, route] of entrypoints.routes) {
    switch (route.type) {
      case 'page':
      case 'page-api':
        currentEntrypoints.page.set(pathname, route)
        break
      case 'app-page': {
        route.pages.forEach((page) => {
          currentEntrypoints.app.set(page.originalName, {
            type: 'app-page',
            ...page,
          })
        })
        break
      }
      case 'app-route': {
        currentEntrypoints.app.set(route.originalName, route)
        break
      }
      case 'conflict':
        Log.info(`skipping ${pathname} (${route.type})`)
        break
      default:
        route satisfies never
    }
  }

  if (dev) {
    await handleEntrypointsDevCleanup({
      currentEntryIssues,
      currentEntrypoints,

      ...dev,
    })
  }

  const { middleware, instrumentation } = entrypoints

  // We check for explicit true/false, since it's initialized to
  // undefined during the first loop (middlewareChanges event is
  // unnecessary during the first serve)
  if (currentEntrypoints.global.middleware && !middleware) {
    const key = getEntryKey('root', 'server', 'middleware')
    // Went from middleware to no middleware
    await dev?.hooks.unsubscribeFromChanges(key)
    currentEntryIssues.delete(key)
    dev.hooks.sendHmr('middleware', {
      type: HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  } else if (!currentEntrypoints.global.middleware && middleware) {
    // Went from no middleware to middleware
    dev.hooks.sendHmr('middleware', {
      type: HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  }

  currentEntrypoints.global.middleware = middleware

  if (instrumentation) {
    const processInstrumentation = async (
      name: string,
      prop: 'nodeJs' | 'edge'
    ) => {
      const prettyName = {
        nodeJs: 'Node.js',
        edge: 'Edge',
      }
      const finishBuilding = dev.hooks.startBuilding(
        `instrumentation ${prettyName[prop]}`,
        undefined,
        true
      )
      const key = getEntryKey('root', 'server', name)

      const writtenEndpoint = await instrumentation[prop].writeToDisk()
      dev.hooks.handleWrittenEndpoint(key, writtenEndpoint, false)
      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
      finishBuilding()
    }
    await processInstrumentation('instrumentation.nodeJs', 'nodeJs')
    await processInstrumentation('instrumentation.edge', 'edge')
    await manifestLoader.loadMiddlewareManifest(
      'instrumentation',
      'instrumentation'
    )
    manifestLoader.writeManifests({
      devRewrites,
      productionRewrites: undefined,
      entrypoints: currentEntrypoints,
    })

    dev.serverFields.actualInstrumentationHookFile = '/instrumentation'
    await dev.hooks.propagateServerField(
      'actualInstrumentationHookFile',
      dev.serverFields.actualInstrumentationHookFile
    )
  } else {
    dev.serverFields.actualInstrumentationHookFile = undefined
    await dev.hooks.propagateServerField(
      'actualInstrumentationHookFile',
      dev.serverFields.actualInstrumentationHookFile
    )
  }

  if (middleware) {
    const key = getEntryKey('root', 'server', 'middleware')

    const endpoint = middleware.endpoint
    const triggerName = middleware.isProxy
      ? PROXY_FILENAME
      : MIDDLEWARE_FILENAME

    async function processMiddleware() {
      const finishBuilding = dev.hooks.startBuilding(
        triggerName,
        undefined,
        true
      )
      const writtenEndpoint = await endpoint.writeToDisk()
      dev.hooks.handleWrittenEndpoint(key, writtenEndpoint, false)
      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
      await manifestLoader.loadMiddlewareManifest('middleware', 'middleware')
      const middlewareConfig =
        manifestLoader.getMiddlewareManifest(key)?.middleware['/']

      if (dev && middlewareConfig) {
        dev.serverFields.middleware = {
          match: null as any,
          page: '/',
          matchers: middlewareConfig.matchers,
        }
      }
      finishBuilding()
    }
    await processMiddleware()

    if (dev) {
      dev?.hooks.subscribeToChanges(
        key,
        false,
        endpoint,
        async () => {
          const finishBuilding = dev.hooks.startBuilding(
            triggerName,
            undefined,
            true
          )
          await processMiddleware()
          await dev.hooks.propagateServerField(
            'actualMiddlewareFile',
            dev.serverFields.actualMiddlewareFile
          )
          await dev.hooks.propagateServerField(
            'middleware',
            dev.serverFields.middleware
          )
          manifestLoader.writeManifests({
            devRewrites,
            productionRewrites: undefined,
            entrypoints: currentEntrypoints,
          })

          finishBuilding?.()
          return {
            type: HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
          }
        },
        () => {
          return {
            type: HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
          }
        }
      )
    }
  } else {
    manifestLoader.deleteMiddlewareManifest(
      getEntryKey('root', 'server', 'middleware')
    )
    dev.serverFields.actualMiddlewareFile = undefined
    dev.serverFields.middleware = undefined
  }

  await dev.hooks.propagateServerField(
    'actualMiddlewareFile',
    dev.serverFields.actualMiddlewareFile
  )
  await dev.hooks.propagateServerField(
    'middleware',
    dev.serverFields.middleware
  )
}

async function handleEntrypointsDevCleanup({
  currentEntryIssues,
  currentEntrypoints,

  assetMapper,
  changeSubscriptions,
  clients,
  clientStates,

  hooks,
}: {
  currentEntrypoints: Entrypoints
  currentEntryIssues: EntryIssuesMap
} & HandleEntrypointsDevOpts) {
  // this needs to be first as `hasEntrypointForKey` uses the `assetMapper`
  for (const key of assetMapper.keys()) {
    if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
      assetMapper.delete(key)
    }
  }

  for (const key of changeSubscriptions.keys()) {
    // middleware is handled separately
    if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
      await hooks.unsubscribeFromChanges(key)
    }
  }

  for (const [key] of currentEntryIssues) {
    if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
      currentEntryIssues.delete(key)
    }
  }

  for (const client of clients) {
    const state = clientStates.get(client)
    if (!state) {
      continue
    }

    for (const key of state.clientIssues.keys()) {
      if (!hasEntrypointForKey(currentEntrypoints, key, assetMapper)) {
        state.clientIssues.delete(key)
      }
    }

    for (const id of state.subscriptions.keys()) {
      if (
        !hasEntrypointForKey(
          currentEntrypoints,
          getEntryKey('assets', 'client', id),
          assetMapper
        )
      ) {
        hooks.unsubscribeFromHmrEvents(client, id)
      }
    }
  }
}

export async function handlePagesErrorRoute({
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  devRewrites,
  productionRewrites,
  logErrors,
  hooks,
}: {
  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
  hooks: HandleRouteTypeHooks
}) {
  if (entrypoints.global.app) {
    const key = getEntryKey('pages', 'server', '_app')

    const writtenEndpoint = await entrypoints.global.app.writeToDisk()
    hooks.handleWrittenEndpoint(key, writtenEndpoint, false)
    hooks.subscribeToChanges(
      key,
      false,
      entrypoints.global.app,
      () => {
        // There's a special case for this in `../client/page-bootstrap.ts`.
        // https://github.com/vercel/next.js/blob/08d7a7e5189a835f5dcb82af026174e587575c0e/packages/next/src/client/page-bootstrap.ts#L69-L71
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES,
        }
      },
      () => {
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
          data: '_app has changed (error route)',
        }
      }
    )
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }
  await manifestLoader.loadBuildManifest('_app')
  await manifestLoader.loadPagesManifest('_app')
  await manifestLoader.loadFontManifest('_app')

  if (entrypoints.global.document) {
    const key = getEntryKey('pages', 'server', '_document')

    const writtenEndpoint = await entrypoints.global.document.writeToDisk()
    hooks.handleWrittenEndpoint(key, writtenEndpoint, false)
    hooks.subscribeToChanges(
      key,
      false,
      entrypoints.global.document,
      () => {
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
          data: '_document has changed (error route)',
        }
      },
      (e) => {
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
          data: `error in _document subscription (error route): ${e}`,
        }
      }
    )
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }
  await manifestLoader.loadPagesManifest('_document')

  if (entrypoints.global.error) {
    const key = getEntryKey('pages', 'server', '_error')

    const writtenEndpoint = await entrypoints.global.error.writeToDisk()
    hooks.handleWrittenEndpoint(key, writtenEndpoint, false)
    hooks.subscribeToChanges(
      key,
      false,
      entrypoints.global.error,
      () => {
        // There's a special case for this in `../client/page-bootstrap.ts`.
        // https://github.com/vercel/next.js/blob/08d7a7e5189a835f5dcb82af026174e587575c0e/packages/next/src/client/page-bootstrap.ts#L69-L71
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES,
        }
      },
      (e) => {
        return {
          type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
          data: `error in _error subscription: ${e}`,
        }
      }
    )
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }
  await manifestLoader.loadClientBuildManifest('_error')
  await manifestLoader.loadBuildManifest('_error')
  await manifestLoader.loadPagesManifest('_error')
  await manifestLoader.loadFontManifest('_error')

  manifestLoader.writeManifests({
    devRewrites,
    productionRewrites,
    entrypoints,
  })
}

export function removeRouteSuffix(route: string): string {
  return route.replace(/\/route$/, '')
}

export function addRouteSuffix(route: string): string {
  return route + '/route'
}

export function addMetadataIdToRoute(route: string): string {
  return route + '/[__metadata_id__]'
}

// Since turbopack will create app pages/route entries based on the structure,
// which means the entry keys are based on file names.
// But for special metadata conventions we'll change the page/pathname to a different path.
// So we need this helper to map the new path back to original turbopack entry key.
export function normalizedPageToTurbopackStructureRoute(
  route: string,
  ext: string | false
): string {
  let entrypointKey = route
  if (isMetadataRoute(entrypointKey)) {
    entrypointKey = entrypointKey.endsWith('/route')
      ? entrypointKey.slice(0, -'/route'.length)
      : entrypointKey

    if (ext) {
      if (entrypointKey.endsWith('/[__metadata_id__]')) {
        entrypointKey = entrypointKey.slice(0, -'/[__metadata_id__]'.length)
      }
      if (entrypointKey.endsWith('/sitemap.xml') && ext !== '.xml') {
        // For dynamic sitemap route, remove the extension
        entrypointKey = entrypointKey.slice(0, -'.xml'.length)
      }
    }
    entrypointKey = entrypointKey + '/route'
  }
  return entrypointKey
}
