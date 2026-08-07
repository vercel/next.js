import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightProxyStatus,
  RequestInsightRouterActivity,
  RequestInsightSource,
} from '../../../shared/lib/request-insights'
import { createAsyncLocalStorage } from '../../app-render/async-local-storage'
import {
  getValidatedDevHtmlRequestId,
  getValidatedDevRequestId,
} from '../dev-request-id'
import type { RequestInsightsCausalParent } from './request-insights-causal'

export type RequestInsightsIdentity = {
  // This is a server-owned storage key. Browser-provided IDs are only used by
  // the development debug channel and must never become Request Insights keys.
  requestId: string
  rootRequestId: string
  retention: RequestInsightsRetentionContext
  debugRequestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
  serverAction?: true
  htmlRequestId: string
  url: string | undefined
  origin?: string
  // Direct, server-owned listener origin. This can differ from `origin` when
  // the development server is reached through a reverse proxy.
  executionOrigin?: string
  parentRootRequestId?: string
  parentFetchIndex?: number
}

export function resolveRequestInsightsIdentity({
  previousIdentity,
  requestIdHeader,
  htmlRequestIdHeader,
  causalParent,
  executionOrigin,
  origin,
  url,
  createRequestId,
}: {
  previousIdentity: RequestInsightsIdentity | undefined
  requestIdHeader: string | string[] | undefined
  htmlRequestIdHeader: string | string[] | undefined
  causalParent?: RequestInsightsCausalParent
  executionOrigin?: string
  origin?: string
  url: string | undefined
  createRequestId: () => string
}): RequestInsightsIdentity {
  if (previousIdentity) {
    return previousIdentity
  }

  const requestId = createRequestId()
  return {
    requestId,
    rootRequestId: requestId,
    retention: createRequestInsightsRetentionContext(),
    debugRequestId: getValidatedDevRequestId(requestIdHeader),
    htmlRequestId:
      getValidatedDevHtmlRequestId(htmlRequestIdHeader) ?? requestId,
    url,
    origin,
    executionOrigin,
    ...(causalParent?.parentRootRequestId !== requestId
      ? causalParent
      : undefined),
  }
}

declare const requestInsightsRetentionContextBrand: unique symbol

export type RequestInsightsRetentionContext = {
  readonly [requestInsightsRetentionContextBrand]: true
}

type RequestInsightsRetentionGate = { closed: boolean }
type RequestInsightsRetentionState = {
  rootGate: RequestInsightsRetentionGate
  recordGate: RequestInsightsRetentionGate
}

const REQUEST_INSIGHTS_RETENTION_STATES_KEY = Symbol.for(
  '@next/request-insights-retention-states'
)

function getRequestInsightsRetentionStates(): WeakMap<
  RequestInsightsRetentionContext,
  RequestInsightsRetentionState
> {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_RETENTION_STATES_KEY]?: WeakMap<
      RequestInsightsRetentionContext,
      RequestInsightsRetentionState
    >
  }
  return (globalStore[REQUEST_INSIGHTS_RETENTION_STATES_KEY] ??= new WeakMap())
}

export function createRequestInsightsRetentionContext(
  parent?: RequestInsightsRetentionContext
): RequestInsightsRetentionContext {
  const parentState = parent
    ? getRequestInsightsRetentionStates().get(parent)
    : undefined
  const context = Object.freeze({}) as RequestInsightsRetentionContext
  getRequestInsightsRetentionStates().set(context, {
    rootGate: parentState?.rootGate ?? { closed: false },
    recordGate: { closed: false },
  })
  return context
}

export function isRequestInsightsRetentionContextOpen(
  context: RequestInsightsRetentionContext
): boolean {
  const state = getRequestInsightsRetentionStates().get(context)
  return Boolean(state && !state.rootGate.closed && !state.recordGate.closed)
}

export function hasSameRequestInsightsRetentionContext(
  left: RequestInsightsRetentionContext,
  right: RequestInsightsRetentionContext
): boolean {
  const states = getRequestInsightsRetentionStates()
  const leftState = states.get(left)
  const rightState = states.get(right)
  return Boolean(
    leftState &&
      rightState &&
      leftState.rootGate === rightState.rootGate &&
      leftState.recordGate === rightState.recordGate
  )
}

export function hasSameRequestInsightsRetentionRoot(
  left: RequestInsightsRetentionContext,
  right: RequestInsightsRetentionContext
): boolean {
  const states = getRequestInsightsRetentionStates()
  const leftState = states.get(left)
  const rightState = states.get(right)
  return Boolean(
    leftState && rightState && leftState.rootGate === rightState.rootGate
  )
}

export function closeRequestInsightsRetentionRecord(
  context: RequestInsightsRetentionContext
): void {
  const state = getRequestInsightsRetentionStates().get(context)
  if (state) state.recordGate.closed = true
}

export function closeRequestInsightsRetentionRoot(
  context: RequestInsightsRetentionContext
): void {
  const state = getRequestInsightsRetentionStates().get(context)
  if (state) state.rootGate.closed = true
}

// This storage covers the part of BaseServer request handling that runs before
// App Render creates workAsyncStorage. Once available, workStore remains the
// primary identity source for locally recorded spans.
const REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY = Symbol.for(
  '@next/request-insights-identity-storage'
)

type RequestInsightsIdentityScope = {
  identity: RequestInsightsIdentity | undefined
}

type GlobalWithRequestInsightsIdentityStorage = typeof globalThis & {
  [REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY]?: AsyncLocalStorage<RequestInsightsIdentityScope>
}

function getExistingRequestInsightsIdentityStorage():
  | AsyncLocalStorage<RequestInsightsIdentityScope>
  | undefined {
  return (globalThis as GlobalWithRequestInsightsIdentityStorage)[
    REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY
  ]
}

function getOrCreateRequestInsightsIdentityStorage(): AsyncLocalStorage<RequestInsightsIdentityScope> {
  const globalStore = globalThis as GlobalWithRequestInsightsIdentityStorage

  return (globalStore[REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY] ??=
    createAsyncLocalStorage<RequestInsightsIdentityScope>())
}

export function runWithRequestInsightsIdentity<T>(
  identity: RequestInsightsIdentity | undefined,
  fn: () => T
): T {
  if (!process.env.__NEXT_DEV_SERVER) {
    return fn()
  }

  const storage = getExistingRequestInsightsIdentityStorage()
  if (!storage) {
    return identity === undefined
      ? fn()
      : getOrCreateRequestInsightsIdentityStorage().run({ identity }, fn)
  }

  return storage.getStore()?.identity === identity
    ? fn()
    : storage.run({ identity }, fn)
}

export function getRequestInsightsIdentity():
  | RequestInsightsIdentity
  | undefined {
  if (!process.env.__NEXT_DEV_SERVER) {
    return undefined
  }

  return getExistingRequestInsightsIdentityStorage()?.getStore()?.identity
}
