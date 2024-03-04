import type { NextConfigComplete } from '../config-shared'
import loadJsConfig from '../../build/load-jsconfig'
import type {
  ServerFields,
  SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import type {
  Endpoint,
  Entrypoints as RawEntrypoints,
  Issue,
  StyledString,
  TurbopackResult,
  Update as TurbopackUpdate,
  WrittenEndpoint,
} from '../../build/swc'
import {
  decodeMagicIdentifier,
  MAGIC_IDENTIFIER_REGEX,
} from '../../shared/lib/magic-identifier'
import { bold, green, magenta, red } from '../../lib/picocolors'
import {
  type HMR_ACTION_TYPES,
  HMR_ACTIONS_SENT_TO_BROWSER,
} from './hot-reloader-types'
import * as Log from '../../build/output/log'
import type { PropagateToWorkersField } from '../lib/router-utils/types'
import type { TurbopackManifestLoader } from './turbopack/manifest-loader'
import type { AppRoute, Entrypoints, PageRoute } from './turbopack/types'
import {
  type EntryKey,
  getEntryKey,
  splitEntryKey,
} from './turbopack/entry-key'
import type ws from 'next/dist/compiled/ws'

export async function getTurbopackJsConfig(
  dir: string,
  nextConfig: NextConfigComplete
) {
  const { jsConfig } = await loadJsConfig(dir, nextConfig)
  return jsConfig ?? { compilerOptions: {} }
}

class ModuleBuildError extends Error {}

export function formatIssue(issue: Issue) {
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

  if (source && source.range) {
    const { start } = source.range
    message = `${formattedFilePath}:${start.line + 1}:${
      start.column + 1
    }\n${formattedTitle}`
  } else if (formattedFilePath) {
    message = `${formattedFilePath}\n${formattedTitle}`
  } else {
    message = formattedTitle
  }
  message += '\n'

  if (source?.range && source.source.content) {
    const { start, end } = source.range
    const { codeFrameColumns } = require('next/dist/compiled/babel/code-frame')

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

  // TODO: make it possible to enable this for debugging, but not in tests.
  // if (detail) {
  //   message += renderStyledStringToErrorAnsi(detail) + '\n\n'
  // }

  // TODO: Include a trace from the issue.

  if (documentationLink) {
    message += documentationLink + '\n\n'
  }

  return message
}

type IssueKey = `${Issue['severity']}-${Issue['filePath']}-${string}-${string}`
export type IssuesMap = Map<IssueKey, Issue>
export type EntryIssuesMap = Map<EntryKey, IssuesMap>
export type TopLevelIssuesMap = IssuesMap

function getIssueKey(issue: Issue): IssueKey {
  return `${issue.severity}-${issue.filePath}-${JSON.stringify(
    issue.title
  )}-${JSON.stringify(issue.description)}`
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

export function processIssues(
  currentEntryIssues: EntryIssuesMap,
  key: EntryKey,
  result: TurbopackResult,
  throwIssue = false
) {
  const newIssues = new Map<IssueKey, Issue>()
  currentEntryIssues.set(key, newIssues)

  const relevantIssues = new Set()

  for (const issue of result.issues) {
    if (issue.severity !== 'error' && issue.severity !== 'fatal') continue
    const issueKey = getIssueKey(issue)
    const formatted = formatIssue(issue)
    newIssues.set(issueKey, issue)

    relevantIssues.add(formatted)
  }

  if (relevantIssues.size && throwIssue) {
    throw new ModuleBuildError([...relevantIssues].join('\n\n'))
  }
}

export function renderStyledStringToErrorAnsi(string: StyledString): string {
  function decodeMagicIdentifiers(str: string): string {
    return str.replaceAll(MAGIC_IDENTIFIER_REGEX, (ident) => {
      try {
        return magenta(`{${decodeMagicIdentifier(ident)}}`)
      } catch (e) {
        return magenta(`{${ident} (decoding failed: ${e})}`)
      }
    })
  }

  switch (string.type) {
    case 'text':
      return decodeMagicIdentifiers(string.value)
    case 'strong':
      return bold(red(decodeMagicIdentifiers(string.value)))
    case 'code':
      return green(decodeMagicIdentifiers(string.value))
    case 'line':
      return string.value.map(renderStyledStringToErrorAnsi).join('')
    case 'stack':
      return string.value.map(renderStyledStringToErrorAnsi).join('\n')
    default:
      throw new Error('Unknown StyledString type', string)
  }
}

const MILLISECONDS_IN_NANOSECOND = 1_000_000

export function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * BigInt(MILLISECONDS_IN_NANOSECOND)
}

export type ChangeSubscriptions = Map<
  EntryKey,
  Promise<AsyncIterableIterator<TurbopackResult>>
>

export type HandleWrittenEndpoint = (
  key: EntryKey,
  result: TurbopackResult<WrittenEndpoint>
) => void

export type StartChangeSubscription = (
  key: EntryKey,
  includeIssues: boolean,
  endpoint: Endpoint,
  makePayload: (
    change: TurbopackResult
  ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
) => Promise<void>

export type StopChangeSubscription = (key: EntryKey) => Promise<void>

export type SendHmr = (id: string, payload: HMR_ACTION_TYPES) => void

export type StartBuilding = (
  id: string,
  requestUrl: string | undefined,
  forceRebuild: boolean
) => () => void

export type ReadyIds = Set<string>

export type ClientState = {
  clientIssues: EntryIssuesMap
  hmrPayloads: Map<string, HMR_ACTION_TYPES>
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
  rewrites,
  hooks,
}: {
  dev: boolean
  page: string
  pathname: string
  route: PageRoute | AppRoute

  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  rewrites: SetupOpts['fsChecker']['rewrites']

  readyIds?: ReadyIds // dev

  hooks?: HandleRouteTypeHooks // dev
}) {
  switch (route.type) {
    case 'page': {
      const clientKey = getEntryKey('pages', 'client', page)
      const serverKey = getEntryKey('pages', 'server', page)

      try {
        if (entrypoints.global.app) {
          const key = getEntryKey('pages', 'server', '_app')

          const writtenEndpoint = await entrypoints.global.app.writeToDisk()
          hooks?.handleWrittenEndpoint(key, writtenEndpoint)
          processIssues(currentEntryIssues, key, writtenEndpoint)
        }
        await manifestLoader.loadBuildManifest('_app')
        await manifestLoader.loadPagesManifest('_app')

        if (entrypoints.global.document) {
          const key = getEntryKey('pages', 'server', '_document')

          const writtenEndpoint =
            await entrypoints.global.document.writeToDisk()
          hooks?.handleWrittenEndpoint(key, writtenEndpoint)
          processIssues(currentEntryIssues, key, writtenEndpoint)
        }
        await manifestLoader.loadPagesManifest('_document')

        const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
        hooks?.handleWrittenEndpoint(serverKey, writtenEndpoint)

        const type = writtenEndpoint?.type

        await manifestLoader.loadBuildManifest(page)
        await manifestLoader.loadPagesManifest(page)
        if (type === 'edge') {
          await manifestLoader.loadMiddlewareManifest(page, 'pages')
        } else {
          manifestLoader.deleteMiddlewareManifest(serverKey)
        }
        await manifestLoader.loadFontManifest(page, 'pages')
        await manifestLoader.loadLoadableManifest(page, 'pages')

        await manifestLoader.writeManifests({
          rewrites,
          pageEntrypoints: entrypoints.page,
        })

        processIssues(currentEntryIssues, serverKey, writtenEndpoint)
      } finally {
        // TODO subscriptions should only be caused by the WebSocket connections
        // otherwise we don't known when to unsubscribe and this leaking
        hooks?.subscribeToChanges(serverKey, false, route.dataEndpoint, () => {
          // Report the next compilation again
          readyIds?.delete(pathname)
          return {
            event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
            pages: [page],
          }
        })
        hooks?.subscribeToChanges(clientKey, false, route.htmlEndpoint, () => {
          return {
            event: HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES,
          }
        })
        if (entrypoints.global.document) {
          hooks?.subscribeToChanges(
            getEntryKey('pages', 'server', '_document'),
            false,
            entrypoints.global.document,
            () => {
              return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
            }
          )
        }
      }

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const writtenEndpoint = await route.endpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint)

      const type = writtenEndpoint?.type

      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }
      await manifestLoader.loadLoadableManifest(page, 'pages')

      await manifestLoader.writeManifests({
        rewrites,
        pageEntrypoints: entrypoints.page,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint)

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)

      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint)

      // TODO subscriptions should only be caused by the WebSocket connections
      // otherwise we don't known when to unsubscribe and this leaking
      hooks?.subscribeToChanges(key, true, route.rscEndpoint, (change) => {
        if (change.issues.some((issue) => issue.severity === 'error')) {
          // Ignore any updates that has errors
          // There will be another update without errors eventually
          return
        }
        // Report the next compilation again
        readyIds?.delete(pathname)
        return {
          action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
        }
      })

      const type = writtenEndpoint?.type

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.loadAppBuildManifest(page)
      await manifestLoader.loadBuildManifest(page, 'app')
      await manifestLoader.loadAppPathsManifest(page)
      await manifestLoader.loadActionManifest(page)
      await manifestLoader.loadFontManifest(page, 'app')
      await manifestLoader.writeManifests({
        rewrites,
        pageEntrypoints: entrypoints.page,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint, dev)

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)

      const writtenEndpoint = await route.endpoint.writeToDisk()
      hooks?.handleWrittenEndpoint(key, writtenEndpoint)

      const type = writtenEndpoint?.type

      await manifestLoader.loadAppPathsManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.writeManifests({
        rewrites,
        pageEntrypoints: entrypoints.page,
      })
      processIssues(currentEntryIssues, key, writtenEndpoint, true)

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  clients: Set<ws>
  clientStates: ClientStateMap
  serverFields: ServerFields

  hooks: HandleEntrypointsHooks
}

export async function handleEntrypoints({
  entrypoints,

  currentEntrypoints,

  currentEntryIssues,
  manifestLoader,
  nextConfig,
  rewrites,

  dev,
}: {
  entrypoints: TurbopackResult<RawEntrypoints>

  currentEntrypoints: Entrypoints

  currentEntryIssues: EntryIssuesMap
  manifestLoader: TurbopackManifestLoader
  nextConfig: NextConfigComplete
  rewrites: SetupOpts['fsChecker']['rewrites']

  dev?: HandleEntrypointsDevOpts
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
      default:
        Log.info(`skipping ${pathname} (${route.type})`)
        break
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
    dev?.hooks.sendHmr('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  } else if (!currentEntrypoints.global.middleware && middleware) {
    // Went from no middleware to middleware
    dev?.hooks.sendHmr('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  }

  currentEntrypoints.global.middleware = middleware

  if (nextConfig.experimental.instrumentationHook && instrumentation) {
    const processInstrumentation = async (
      name: string,
      prop: 'nodeJs' | 'edge'
    ) => {
      const key = getEntryKey('root', 'server', name)

      const writtenEndpoint = await instrumentation[prop].writeToDisk()
      dev?.hooks.handleWrittenEndpoint(key, writtenEndpoint)
      processIssues(currentEntryIssues, key, writtenEndpoint)
    }
    await processInstrumentation('instrumentation.nodeJs', 'nodeJs')
    await processInstrumentation('instrumentation.edge', 'edge')
    await manifestLoader.loadMiddlewareManifest(
      'instrumentation',
      'instrumentation'
    )
    await manifestLoader.writeManifests({
      rewrites: rewrites,
      pageEntrypoints: currentEntrypoints.page,
    })

    if (dev) {
      dev.serverFields.actualInstrumentationHookFile = '/instrumentation'
      await dev.hooks.propagateServerField(
        'actualInstrumentationHookFile',
        dev.serverFields.actualInstrumentationHookFile
      )
    }
  } else {
    if (dev) {
      dev.serverFields.actualInstrumentationHookFile = undefined
      await dev.hooks.propagateServerField(
        'actualInstrumentationHookFile',
        dev.serverFields.actualInstrumentationHookFile
      )
    }
  }

  if (middleware) {
    const key = getEntryKey('root', 'server', 'middleware')

    const endpoint = middleware.endpoint

    async function processMiddleware() {
      const writtenEndpoint = await endpoint.writeToDisk()
      dev?.hooks.handleWrittenEndpoint(key, writtenEndpoint)
      processIssues(currentEntryIssues, key, writtenEndpoint)
      await manifestLoader.loadMiddlewareManifest('middleware', 'middleware')
      if (dev) {
        dev.serverFields.middleware = {
          match: null as any,
          page: '/',
          matchers:
            manifestLoader.getMiddlewareManifest(key)?.middleware['/'].matchers,
        }
      }
    }
    await processMiddleware()

    dev?.hooks.subscribeToChanges(key, false, endpoint, async () => {
      const finishBuilding = dev.hooks.startBuilding(
        'middleware',
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
      await manifestLoader.writeManifests({
        rewrites: rewrites,
        pageEntrypoints: currentEntrypoints.page,
      })

      finishBuilding?.()
      return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
    })
  } else {
    manifestLoader.deleteMiddlewareManifest(
      getEntryKey('root', 'server', 'middleware')
    )
    if (dev) {
      dev.serverFields.actualMiddlewareFile = undefined
      dev.serverFields.middleware = undefined
    }
  }

  if (dev) {
    await dev.hooks.propagateServerField(
      'actualMiddlewareFile',
      dev.serverFields.actualMiddlewareFile
    )
    await dev.hooks.propagateServerField(
      'middleware',
      dev.serverFields.middleware
    )
  }
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
  rewrites,

  hooks,
}: {
  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  rewrites: SetupOpts['fsChecker']['rewrites']

  hooks?: HandleRouteTypeHooks // dev
}) {
  if (entrypoints.global.app) {
    const key = getEntryKey('pages', 'server', '_app')

    const writtenEndpoint = await entrypoints.global.app.writeToDisk()
    hooks?.handleWrittenEndpoint(key, writtenEndpoint)
    processIssues(currentEntryIssues, key, writtenEndpoint)
  }
  await manifestLoader.loadBuildManifest('_app')
  await manifestLoader.loadPagesManifest('_app')
  await manifestLoader.loadFontManifest('_app')

  if (entrypoints.global.document) {
    const key = getEntryKey('pages', 'server', '_document')

    const writtenEndpoint = await entrypoints.global.document.writeToDisk()
    hooks?.handleWrittenEndpoint(key, writtenEndpoint)
    hooks?.subscribeToChanges(key, false, entrypoints.global.document, () => {
      return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
    })
    processIssues(currentEntryIssues, key, writtenEndpoint)
  }
  await manifestLoader.loadPagesManifest('_document')

  if (entrypoints.global.error) {
    const key = getEntryKey('pages', 'server', '_error')

    const writtenEndpoint = await entrypoints.global.error.writeToDisk()
    hooks?.handleWrittenEndpoint(key, writtenEndpoint)
    processIssues(currentEntryIssues, key, writtenEndpoint)
  }
  await manifestLoader.loadBuildManifest('_error')
  await manifestLoader.loadPagesManifest('_error')
  await manifestLoader.loadFontManifest('_error')

  await manifestLoader.writeManifests({
    rewrites,
    pageEntrypoints: entrypoints.page,
  })
}
