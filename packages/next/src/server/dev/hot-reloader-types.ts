import type { IncomingMessage, ServerResponse } from 'http'
import type { UrlObject } from 'url'
import type { Duplex } from 'stream'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type getBaseWebpackConfig from '../../build/webpack-config'
import type { RouteMatch } from '../future/route-matches/route-match'
import type { Update as TurbopackUpdate } from '../../build/swc'

export const enum HMR_ACTIONS_SENT_TO_BROWSER {
  ADDED_PAGE = 'addedPage',
  REMOVED_PAGE = 'removedPage',
  RELOAD_PAGE = 'reloadPage',
  SERVER_COMPONENT_CHANGES = 'serverComponentChanges',
  MIDDLEWARE_CHANGES = 'middlewareChanges',
  SERVER_ONLY_CHANGES = 'serverOnlyChanges',
  BUILT = 'built',
  BUILDING = 'building',
  PONG = 'pong',
  DEV_PAGES_MANIFEST_UPDATE = 'devPagesManifestUpdate',
  TURBOPACK_MESSAGE = 'turbopack-message',
}

interface TurboPackMessageAction {
  type: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE
  data: TurbopackUpdate
}

interface BuildingAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING
}

interface BuiltAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.BUILT
  hash: string
  errors: ReadonlyArray<unknown>
  warnings: ReadonlyArray<unknown>
}

interface AddedPageAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE
  data: [page: string | null]
}

interface RemovedPageAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE
  data: [page: string | null]
}

interface ReloadPageAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE
}

interface ServerComponentChangesAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES
}

interface MiddlewareChangesAction {
  event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES
}

interface ServerOnlyChangesAction {
  event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES
  pages: ReadonlyArray<string>
}

interface PongActionAppRouter {
  action: HMR_ACTIONS_SENT_TO_BROWSER.PONG
  success: boolean
}

interface PongActionPagesRouter {
  event: HMR_ACTIONS_SENT_TO_BROWSER.PONG
  success: boolean
}

interface DevPagesManifestUpdateAction {
  action: HMR_ACTIONS_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE
  data: [
    {
      devPagesManifest: true
    }
  ]
}

type PongAction = PongActionAppRouter | PongActionPagesRouter

export type HMR_ACTION_TYPES =
  | TurboPackMessageAction
  | PongAction
  | BuildingAction
  | BuiltAction
  | AddedPageAction
  | RemovedPageAction
  | ReloadPageAction
  | ServerComponentChangesAction
  | MiddlewareChangesAction
  | ServerOnlyChangesAction
  | DevPagesManifestUpdateAction

export interface NextJsHotReloaderInterface {
  activeWebpackConfigs?: Array<Awaited<ReturnType<typeof getBaseWebpackConfig>>>
  serverStats: webpack.Stats | null
  edgeServerStats: webpack.Stats | null
  run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlObject
  ): Promise<{ finished?: true }>

  setHmrServerError(error: Error | null): void
  clearHmrServerError(): void
  start(): Promise<void>
  stop(): Promise<void>
  send(action: HMR_ACTION_TYPES): void
  getCompilationErrors(page: string): Promise<any[]>
  onHMR(req: IncomingMessage, _socket: Duplex, head: Buffer): void
  invalidate({
    reloadAfterInvalidation,
  }: {
    reloadAfterInvalidation: boolean
  }): void
  buildFallbackError(): Promise<void>
  ensurePage({
    page,
    clientOnly,
    appPaths,
    match,
    isApp,
  }: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    isApp?: boolean
    match?: RouteMatch
  }): Promise<void>
}
