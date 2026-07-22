import type { AsyncLocalStorage } from 'async_hooks'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightOperation,
  RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'
import { createAsyncLocalStorage } from '../../app-render/async-local-storage'
import {
  setRequestInsightsRuntime,
  type RequestInsightFetchInput,
  type RequestInsightOperationHandle,
  type RequestInsightOperationInput,
  type RequestInsightOperationResult,
  type RequestInsightSessionInput,
  type RequestInsightSessionResult,
  type RequestInsightsRuntime as RequestInsightsRuntimeInterface,
} from './request-insights'

const MAX_REQUEST_INSIGHTS = 100
const REDACTED_VALUE = 'redacted'
const SENSITIVE_PARAM_NAME_RE =
  /(?:^|[_-])(?:access[_-]?token|api[_-]?key|auth|authorization|code|cookie|credential|id[_-]?token|jwt|key|password|secret|session|signature|sig|token)(?:$|[_-])/i

type RequestInsightsListener = (insight: RequestInsight) => void

type RequestInsightsSession = {
  requestId: string
  htmlRequestId: string
  route: string | undefined
  url: string | undefined
  method: string | undefined
  statusCode: number | undefined
  isRsc: boolean | undefined
  startTime: number
  operations: RequestInsightOperation[]
  fetches: RequestInsightFetch[]
  completed: boolean
  nextOperationId: number
  nextFetchId: number
}

type RequestInsightOperationState = RequestInsightOperationHandle & {
  parentId: number | undefined
  type: string
  name: string
  category: 'nextjs' | 'application'
  startTime: number
  session: RequestInsightsSession
  ended: boolean
}

type RequestInsightsContext = {
  session: RequestInsightsSession
  activeOperation: RequestInsightOperationState | undefined
}

export class RequestInsightsRuntime implements RequestInsightsRuntimeInterface {
  private readonly asyncStorage: AsyncLocalStorage<RequestInsightsContext>
  private readonly requests: RequestInsight[]
  private readonly listeners: Set<RequestInsightsListener>
  private enabled: boolean

  constructor() {
    this.asyncStorage = createAsyncLocalStorage()
    this.requests = []
    this.listeners = new Set()
    this.enabled = false
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isActive(): boolean {
    const context = this.asyncStorage.getStore()
    return this.enabled && context !== undefined && !context.session.completed
  }

  runWithSession<T>(input: RequestInsightSessionInput, fn: () => T): T {
    if (!this.enabled) {
      return fn()
    }

    const session: RequestInsightsSession = {
      requestId: input.requestId,
      htmlRequestId: input.htmlRequestId,
      route: undefined,
      url: sanitizeUrl(input.url),
      method: input.method,
      statusCode: undefined,
      isRsc: undefined,
      startTime: input.startTime ?? Date.now(),
      operations: [],
      fetches: [],
      completed: false,
      nextOperationId: 1,
      nextFetchId: 1,
    }
    const context: RequestInsightsContext = {
      session,
      activeOperation: undefined,
    }

    return this.asyncStorage.run(context, fn)
  }

  finishSession(result: RequestInsightSessionResult): void {
    const context = this.asyncStorage.getStore()
    if (!context || context.session.completed) {
      return
    }

    const session = context.session
    const endTime = result.endTime ?? Date.now()
    session.completed = true
    session.route = result.route
    session.method = result.method ?? session.method
    session.statusCode = result.statusCode
    session.isRsc = result.isRsc

    const status =
      result.status ??
      (result.error !== undefined ||
      (session.statusCode !== undefined && session.statusCode >= 500)
        ? 'error'
        : 'ok')

    session.operations.sort(compareTimelineEntries)
    session.fetches.sort(compareTimelineEntries)

    const insight: RequestInsight = {
      requestId: session.requestId,
      htmlRequestId: session.htmlRequestId,
      route: session.route,
      url: session.url,
      method: session.method,
      statusCode: session.statusCode,
      isRsc: session.isRsc,
      startTime: session.startTime,
      durationMs: Math.max(0, endTime - session.startTime),
      status,
      operations: session.operations.slice(),
      fetches: session.fetches.slice(),
    }

    this.requests.push(insight)
    if (this.requests.length > MAX_REQUEST_INSIGHTS) {
      this.requests.splice(0, this.requests.length - MAX_REQUEST_INSIGHTS)
    }

    for (const listener of this.listeners) {
      listener(insight)
    }
  }

  beginOperation(
    input: RequestInsightOperationInput
  ): RequestInsightOperationHandle | undefined {
    const context = this.asyncStorage.getStore()
    if (
      !this.enabled ||
      !context ||
      context.session.completed ||
      input.type === 'AppRender.fetch'
    ) {
      return undefined
    }

    const session = context.session
    const operation: RequestInsightOperationState = {
      id: session.nextOperationId++,
      parentId: context.activeOperation?.id,
      type: input.type,
      name: input.name,
      category: input.category ?? 'nextjs',
      startTime: input.startTime ?? Date.now(),
      session,
      ended: false,
    }
    return operation
  }

  runWithOperation<T>(
    operationHandle: RequestInsightOperationHandle | undefined,
    fn: () => T
  ): T {
    if (!operationHandle) {
      return fn()
    }

    const operation = operationHandle as RequestInsightOperationState
    const context = this.asyncStorage.getStore()
    if (
      !context ||
      context.session !== operation.session ||
      context.session.completed ||
      operation.ended
    ) {
      return fn()
    }

    return this.asyncStorage.run(
      { session: context.session, activeOperation: operation },
      fn
    )
  }

  endOperation(
    operationHandle: RequestInsightOperationHandle | undefined,
    result: RequestInsightOperationResult = {}
  ): void {
    if (!operationHandle) {
      return
    }

    const operation = operationHandle as RequestInsightOperationState
    const session = operation.session
    if (operation.ended || session.completed) {
      return
    }

    operation.ended = true
    const error = getRequestInsightError(result.error)
    const status =
      result.status ?? (result.error !== undefined ? 'error' : 'ok')
    const endTime = result.endTime ?? Date.now()
    const completedOperation: RequestInsightOperation = {
      id: operation.id,
      parentId: operation.parentId,
      type: operation.type,
      name: operation.name,
      category: operation.category,
      startTime: operation.startTime,
      durationMs: Math.max(0, endTime - operation.startTime),
      status,
      error,
    }
    session.operations.push(completedOperation)
  }

  runDetached<T>(fn: () => T): T {
    const context = this.asyncStorage.getStore()
    if (!context || context.session.completed) {
      return fn()
    }

    return this.asyncStorage.run(
      { session: context.session, activeOperation: undefined },
      fn
    )
  }

  recordFetch(fetch: RequestInsightFetchInput): void {
    const context = this.asyncStorage.getStore()
    if (!this.enabled || !context || context.session.completed) {
      return
    }

    const session = context.session
    session.fetches.push({
      id: session.nextFetchId++,
      parentOperationId: context.activeOperation?.id,
      url: sanitizeUrl(fetch.url),
      method: fetch.method,
      statusCode: fetch.statusCode,
      startTime: fetch.startTime,
      durationMs: fetch.durationMs,
      cacheStatus: fetch.cacheStatus,
      cacheReason: fetch.cacheReason,
      index: fetch.index,
    })
  }

  getSnapshot(): RequestInsightsSnapshot {
    return { requests: this.requests.slice() }
  }

  subscribe(listener: RequestInsightsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    this.requests.length = 0
  }
}

let registeredRuntime: RequestInsightsRuntime | undefined

export function registerRequestInsightsRuntime(): RequestInsightsRuntime {
  registeredRuntime ??= new RequestInsightsRuntime()
  setRequestInsightsRuntime(registeredRuntime)
  return registeredRuntime
}

export function unregisterRequestInsightsRuntimeForTest(): void {
  registeredRuntime = undefined
  setRequestInsightsRuntime(undefined)
}

function compareTimelineEntries(
  a: { startTime?: number; id: number },
  b: { startTime?: number; id: number }
): number {
  return (a.startTime ?? 0) - (b.startTime ?? 0) || a.id - b.id
}

function getRequestInsightError(
  value: unknown
): RequestInsightOperation['error'] | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (value instanceof Error) {
    return { type: value.name, message: value.message }
  }

  if (typeof value === 'object') {
    const error = value as { name?: unknown; message?: unknown }
    const type = typeof error.name === 'string' ? error.name : undefined
    const message =
      typeof error.message === 'string' ? error.message : undefined
    if (type !== undefined || message !== undefined) {
      return { type, message }
    }
  }

  return { message: String(value) }
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value
  }

  const isRelativeUrl = value.startsWith('/')

  try {
    const url = isRelativeUrl ? new URL(value, 'http://n') : new URL(value)

    url.username = ''
    url.password = ''

    for (const name of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_PARAM_NAME_RE.test(name)) {
        url.searchParams.set(name, REDACTED_VALUE)
      }
    }

    return isRelativeUrl ? `${url.pathname}${url.search}${url.hash}` : url.href
  } catch {
    return value
  }
}
