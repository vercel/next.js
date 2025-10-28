import type { IncomingMessage, ServerResponse } from 'http'
import type { UrlObject } from 'url'
import type { Duplex } from 'stream'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type getBaseWebpackConfig from '../../build/webpack-config'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { Project, Update as TurbopackUpdate } from '../../build/swc/types'
import type { VersionInfo } from './parse-version-info'
import type { DebugInfo } from '../../next-devtools/shared/types'
import type { DevIndicatorServerState } from './dev-indicator-server-state'
import type {
  CacheIndicatorState,
  ServerCacheStatus,
} from '../../next-devtools/dev-overlay/cache-indicator'
import type { DevToolsConfig } from '../../next-devtools/dev-overlay/shared'
import type { ReactDebugChannelForBrowser } from './debug-channel'

export const enum HMR_MESSAGE_SENT_TO_BROWSER {
  // JSON messages:
  ADDED_PAGE = 'addedPage',
  REMOVED_PAGE = 'removedPage',
  RELOAD_PAGE = 'reloadPage',
  SERVER_COMPONENT_CHANGES = 'serverComponentChanges',
  MIDDLEWARE_CHANGES = 'middlewareChanges',
  CLIENT_CHANGES = 'clientChanges',
  SERVER_ONLY_CHANGES = 'serverOnlyChanges',
  SYNC = 'sync',
  BUILT = 'built',
  BUILDING = 'building',
  DEV_PAGES_MANIFEST_UPDATE = 'devPagesManifestUpdate',
  TURBOPACK_MESSAGE = 'turbopack-message',
  SERVER_ERROR = 'serverError',
  TURBOPACK_CONNECTED = 'turbopack-connected',
  ISR_MANIFEST = 'isrManifest',
  CACHE_INDICATOR = 'cacheIndicator',
  DEV_INDICATOR = 'devIndicator',
  DEVTOOLS_CONFIG = 'devtoolsConfig',
  REQUEST_CURRENT_ERROR_STATE = 'requestCurrentErrorState',
  REQUEST_PAGE_METADATA = 'requestPageMetadata',

  // Binary messages:
  REACT_DEBUG_CHUNK = 0,
}

export const enum HMR_MESSAGE_SENT_TO_SERVER {
  // JSON messages:
  MCP_ERROR_STATE_RESPONSE = 'mcp-error-state-response',
  MCP_PAGE_METADATA_RESPONSE = 'mcp-page-metadata-response',
  PING = 'ping',
}

export interface ServerErrorMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR
  errorJSON: string
}

export interface TurbopackMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE
  data: TurbopackUpdate | TurbopackUpdate[]
}

export interface BuildingMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING
}

export interface CompilationError {
  moduleName?: string
  message: string
  details?: string
  moduleTrace?: Array<{ moduleName?: string }>
  stack?: string
}

export interface SyncMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.SYNC
  hash: string
  errors: ReadonlyArray<CompilationError>
  warnings: ReadonlyArray<CompilationError>
  versionInfo: VersionInfo
  updatedModules?: ReadonlyArray<string>
  debug?: DebugInfo
  devIndicator: DevIndicatorServerState
  devToolsConfig?: DevToolsConfig
}

export interface BuiltMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.BUILT
  hash: string
  errors: ReadonlyArray<CompilationError>
  warnings: ReadonlyArray<CompilationError>
  updatedModules?: ReadonlyArray<string>
}

export interface AddedPageMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.ADDED_PAGE
  data: [page: string | null]
}

export interface RemovedPageMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.REMOVED_PAGE
  data: [page: string | null]
}

export interface ReloadPageMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE
  data: string
}

export interface ServerComponentChangesMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES
  hash: string
}

export interface MiddlewareChangesMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.MIDDLEWARE_CHANGES
}

export interface ClientChangesMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.CLIENT_CHANGES
}

export interface ServerOnlyChangesMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ONLY_CHANGES
  pages: ReadonlyArray<string>
}

export interface DevPagesManifestUpdateMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.DEV_PAGES_MANIFEST_UPDATE
  data: [
    {
      devPagesManifest: true
    },
  ]
}

export interface TurbopackConnectedMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED
  data: { sessionId: number }
}

export interface AppIsrManifestMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST
  data: Record<string, boolean>
}

export interface DevToolsConfigMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.DEVTOOLS_CONFIG
  data: DevToolsConfig
}

export interface ReactDebugChunkMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK
  requestId: string
  /**
   * A null chunk signals to the browser that no more chunks will be sent.
   */
  chunk: Uint8Array | null
}

export interface RequestCurrentErrorStateMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE
  requestId: string
}

export interface RequestPageMetadataMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA
  requestId: string
}

export interface CacheIndicatorMessage {
  type: HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR
  state: CacheIndicatorState
}

export type HmrMessageSentToBrowser =
  | TurbopackMessage
  | TurbopackConnectedMessage
  | BuildingMessage
  | SyncMessage
  | BuiltMessage
  | AddedPageMessage
  | RemovedPageMessage
  | ReloadPageMessage
  | ServerComponentChangesMessage
  | ClientChangesMessage
  | MiddlewareChangesMessage
  | ServerOnlyChangesMessage
  | DevPagesManifestUpdateMessage
  | ServerErrorMessage
  | AppIsrManifestMessage
  | DevToolsConfigMessage
  | ReactDebugChunkMessage
  | RequestCurrentErrorStateMessage
  | RequestPageMetadataMessage
  | CacheIndicatorMessage

export type BinaryHmrMessageSentToBrowser = Extract<
  HmrMessageSentToBrowser,
  { type: number }
>

export type TurbopackMessageSentToBrowser =
  | {
      type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE
      data: any
    }
  | {
      type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED
      data: { sessionId: number }
    }

export interface NextJsHotReloaderInterface {
  turbopackProject?: Project
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
  send(action: HmrMessageSentToBrowser): void
  /**
   * Send the given action only to legacy clients, i.e. Pages Router clients,
   * and App Router clients that don't have Cache Components enabled.
   */
  sendToLegacyClients(action: HmrMessageSentToBrowser): void
  setCacheStatus(
    status: ServerCacheStatus,
    htmlRequestId: string,
    requestId: string
  ): void
  setReactDebugChannel(
    debugChannel: ReactDebugChannelForBrowser,
    htmlRequestId: string,
    requestId: string
  ): void
  getCompilationErrors(page: string): Promise<any[]>
  onHMR(
    req: IncomingMessage,
    _socket: Duplex,
    head: Buffer,
    onUpgrade: (
      client: { send(data: string): void },
      context: { isLegacyClient: boolean }
    ) => void
  ): void
  invalidate({
    reloadAfterInvalidation,
  }: {
    reloadAfterInvalidation: boolean
  }): Promise<void> | void
  buildFallbackError(): Promise<void>
  ensurePage({
    page,
    clientOnly,
    appPaths,
    definition,
    isApp,
    url,
  }: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    isApp?: boolean
    definition: RouteDefinition | undefined
    url?: string
  }): Promise<void>
  close(): void
}
