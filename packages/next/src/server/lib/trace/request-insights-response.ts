import type { ServerResponse } from 'node:http'

import type { WebNextResponse } from '../../base-http/web'
import type { RequestInsightResponse } from '../../../next-devtools/shared/request-insights'

export type RequestInsightResponseLifecycle = RequestInsightResponse & {
  endTime: number
  outcome: 'finished' | 'aborted' | 'errored'
}

type RequestInsightResponseCallbacks = {
  /** Lifecycle observation was attached. This is not a first-byte signal. */
  onAttach(trackingStartTime: number): void
  onComplete(lifecycle: RequestInsightResponseLifecycle): void
}

const trackedResponses = new WeakSet<object>()
const knownResponseErrorTypes = new Set([
  'AbortError',
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'ResponseAborted',
  'SyntaxError',
  'TypeError',
  'URIError',
])

/**
 * Observes the actual Node response lifetime without changing the lifetime of
 * the public OpenTelemetry request span.
 */
export function trackRequestInsightNodeResponse(
  response: ServerResponse,
  callbacks: RequestInsightResponseCallbacks
): void {
  if (trackedResponses.has(response)) {
    return
  }

  trackedResponses.add(response)
  const trackingStartTime = getCurrentTimestamp()
  let completed = false
  let committedStatusCode = response.headersSent
    ? response.statusCode
    : undefined
  const restoreWriteHead = captureCommittedStatusCode(
    response,
    (statusCode) => {
      committedStatusCode = statusCode
    }
  )

  const cleanup = () => {
    restoreWriteHead()
    response.off('finish', onFinish)
    response.off('close', onClose)
  }
  const complete = (
    outcome: RequestInsightResponseLifecycle['outcome'],
    error?: unknown
  ) => {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    safelyInvokeCallback(() => {
      callbacks.onComplete({
        trackingStartTime,
        endTime: getCurrentTimestamp(),
        statusCode:
          committedStatusCode ??
          (response.headersSent || response.writableFinished
            ? response.statusCode
            : undefined),
        outcome,
        error: getResponseError(error, outcome),
      })
    })
  }
  const onFinish = () => complete('finished')
  const onClose = () => {
    if (response.writableFinished) {
      complete('finished')
      return
    }

    const responseError = response.errored
    if (
      responseError !== null &&
      responseError !== undefined &&
      !isResponseAbortError(responseError)
    ) {
      complete('errored', responseError)
    } else {
      complete('aborted', responseError)
    }
  }

  safelyInvokeCallback(() => callbacks.onAttach(trackingStartTime))

  if (response.writableFinished) {
    complete('finished')
    return
  }
  if (response.destroyed) {
    onClose()
    return
  }

  response.once('finish', onFinish)
  response.once('close', onClose)
}

/**
 * Observes consumption of a Web response. The Web response records its status
 * when `toResponse()` commits it and distinguishes completion, cancellation,
 * and source-stream errors.
 */
export function trackRequestInsightWebResponse(
  response: WebNextResponse,
  callbacks: RequestInsightResponseCallbacks
): void {
  if (trackedResponses.has(response)) {
    return
  }

  trackedResponses.add(response)
  const trackingStartTime = getCurrentTimestamp()

  try {
    response.onResponseEnd((result) => {
      safelyInvokeCallback(() => {
        callbacks.onComplete({
          trackingStartTime,
          endTime: getCurrentTimestamp(),
          statusCode: result.statusCode,
          outcome: result.outcome,
          error: getResponseError(
            'error' in result ? result.error : undefined,
            result.outcome
          ),
        })
      })
    })
  } catch (error) {
    safelyInvokeCallback(() => {
      console.error(
        '[request-insights] failed to attach response lifecycle tracking',
        error
      )
    })
    return
  }

  safelyInvokeCallback(() => callbacks.onAttach(trackingStartTime))
}

function captureCommittedStatusCode(
  response: ServerResponse,
  onCommit: (statusCode: number) => void
): () => void {
  if (response.headersSent || typeof response.writeHead !== 'function') {
    return () => {}
  }

  const originalWriteHead = response.writeHead
  let restored = false
  const restore = () => {
    if (restored) {
      return
    }
    restored = true
    if (response.writeHead === wrappedWriteHead) {
      response.writeHead = originalWriteHead
    }
  }
  const wrappedWriteHead = function (this: ServerResponse, ...args: unknown[]) {
    restore()
    const result = Reflect.apply(
      originalWriteHead,
      this,
      args
    ) as ServerResponse
    onCommit(this.statusCode)
    return result
  } as ServerResponse['writeHead']

  response.writeHead = wrappedWriteHead
  return restore
}

function isResponseAbortError(error: unknown): boolean {
  const name = getErrorName(error)
  if (name === 'AbortError' || name === 'ResponseAborted') {
    return true
  }
  if (
    (typeof error !== 'object' || error === null) &&
    typeof error !== 'function'
  ) {
    return false
  }

  try {
    return (error as { code?: unknown }).code === 'ECONNRESET'
  } catch {
    return false
  }
}

function getResponseError(
  error: unknown,
  outcome: RequestInsightResponseLifecycle['outcome']
): RequestInsightResponseLifecycle['error'] {
  if (outcome === 'aborted') {
    return { type: 'ResponseAborted' }
  }

  const errorName = getErrorName(error)
  if (errorName !== undefined) {
    return {
      type: knownResponseErrorTypes.has(errorName) ? errorName : 'Error',
    }
  }
  if (error === undefined || error === null) {
    return undefined
  }
  return { type: 'UnknownResponseError' }
}

function getErrorName(error: unknown): string | undefined {
  if (
    (typeof error !== 'object' || error === null) &&
    typeof error !== 'function'
  ) {
    return undefined
  }

  try {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}

function safelyInvokeCallback(callback: () => void): void {
  try {
    callback()
  } catch (error) {
    console.error(
      '[request-insights] response lifecycle callback failed',
      error
    )
  }
}

function getCurrentTimestamp(): number {
  return performance.timeOrigin + performance.now()
}
