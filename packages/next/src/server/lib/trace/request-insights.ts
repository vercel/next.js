import type {
  RequestInsightFetch,
  RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'

const REQUEST_INSIGHTS_RUNTIME_KEY = Symbol.for(
  '@next/request-insights-runtime'
)

export type RequestInsightSessionInput = {
  requestId: string
  htmlRequestId: string
  url?: string
  method?: string
  startTime?: number
}

export type RequestInsightSessionResult = {
  route?: string
  method?: string
  statusCode?: number
  isRsc?: boolean
  status?: 'ok' | 'error'
  error?: unknown
  endTime?: number
}

export type RequestInsightOperationInput = {
  type: string
  name: string
  category?: 'nextjs' | 'application'
  startTime?: number
}

export type RequestInsightOperationResult = {
  status?: 'ok' | 'error'
  error?: unknown
  endTime?: number
}

export type RequestInsightOperationHandle = {
  readonly id: number
}

export type RequestInsightFetchInput = Omit<
  RequestInsightFetch,
  'id' | 'parentOperationId'
>

type RequestInsightsListener = (
  insight: RequestInsightsSnapshot['requests'][number]
) => void

export interface RequestInsightsRuntime {
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  isActive(): boolean
  runWithSession<T>(input: RequestInsightSessionInput, fn: () => T): T
  finishSession(result: RequestInsightSessionResult): void
  beginOperation(
    input: RequestInsightOperationInput
  ): RequestInsightOperationHandle | undefined
  runWithOperation<T>(
    operation: RequestInsightOperationHandle | undefined,
    fn: () => T
  ): T
  endOperation(
    operation: RequestInsightOperationHandle | undefined,
    result?: RequestInsightOperationResult
  ): void
  runDetached<T>(fn: () => T): T
  recordFetch(fetch: RequestInsightFetchInput): void
  getSnapshot(): RequestInsightsSnapshot
  subscribe(listener: RequestInsightsListener): () => void
  clear(): void
}

type GlobalWithRequestInsightsRuntime = typeof globalThis & {
  [REQUEST_INSIGHTS_RUNTIME_KEY]?: RequestInsightsRuntime
}

function getRequestInsightsRuntime(): RequestInsightsRuntime | undefined {
  return (globalThis as GlobalWithRequestInsightsRuntime)[
    REQUEST_INSIGHTS_RUNTIME_KEY
  ]
}

export function setRequestInsightsRuntime(
  runtime: RequestInsightsRuntime | undefined
): void {
  const globalWithRuntime = globalThis as GlobalWithRequestInsightsRuntime
  if (runtime) {
    globalWithRuntime[REQUEST_INSIGHTS_RUNTIME_KEY] = runtime
  } else {
    delete globalWithRuntime[REQUEST_INSIGHTS_RUNTIME_KEY]
  }
}

export function setRequestInsightsEnabled(enabled: boolean): void {
  getRequestInsightsRuntime()?.setEnabled(enabled)
}

export function isRequestInsightsEnabled(): boolean {
  return getRequestInsightsRuntime()?.isEnabled() ?? false
}

export function isRequestInsightsActive(): boolean {
  return getRequestInsightsRuntime()?.isActive() ?? false
}

export function runWithRequestInsightsSession<T>(
  input: RequestInsightSessionInput,
  fn: () => T
): T {
  const runtime = getRequestInsightsRuntime()
  return runtime?.isEnabled() ? runtime.runWithSession(input, fn) : fn()
}

export function finishRequestInsightSession(
  result: RequestInsightSessionResult
): void {
  getRequestInsightsRuntime()?.finishSession(result)
}

export function beginRequestInsightOperation(
  input: RequestInsightOperationInput
): RequestInsightOperationHandle | undefined {
  return getRequestInsightsRuntime()?.beginOperation(input)
}

export function runWithRequestInsightOperation<T>(
  operation: RequestInsightOperationHandle | undefined,
  fn: () => T
): T {
  const runtime = getRequestInsightsRuntime()
  return runtime ? runtime.runWithOperation(operation, fn) : fn()
}

export function endRequestInsightOperation(
  operation: RequestInsightOperationHandle | undefined,
  result?: RequestInsightOperationResult
): void {
  getRequestInsightsRuntime()?.endOperation(operation, result)
}

export function runWithDetachedRequestInsightContext<T>(fn: () => T): T {
  const runtime = getRequestInsightsRuntime()
  return runtime?.isActive() ? runtime.runDetached(fn) : fn()
}

export function recordRequestInsightFetch(
  fetch: RequestInsightFetchInput
): void {
  getRequestInsightsRuntime()?.recordFetch(fetch)
}

export function getRequestInsightsSnapshot(): RequestInsightsSnapshot {
  return getRequestInsightsRuntime()?.getSnapshot() ?? { requests: [] }
}

export function subscribeRequestInsights(
  listener: RequestInsightsListener
): () => void {
  let runtime: RequestInsightsRuntime | undefined
  if (process.env.__NEXT_DEV_SERVER) {
    runtime =
      getRequestInsightsRuntime() ??
      (
        require('./request-insights-runtime') as typeof import('./request-insights-runtime')
      ).registerRequestInsightsRuntime()
  } else {
    runtime = getRequestInsightsRuntime()
  }

  return runtime?.subscribe(listener) ?? (() => {})
}

export function clearRequestInsightsForTest(): void {
  getRequestInsightsRuntime()?.clear()
}
