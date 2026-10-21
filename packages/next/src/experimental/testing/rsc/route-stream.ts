import { PassThrough, Readable } from 'node:stream'
import type RenderResult from '../../../server/render-result'
import { createRequestResponseMocks } from '../../../server/lib/mock-request'
import { RenderRequestCleanupError } from './render-request'
import type {
  RscRouteStreamCompletion,
  RscRouteStreamResponse,
  RscRouteStreamResult,
} from './types'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** One live Node response and its byte consumer; never a replay of buffers. */
export function createRouteStreamResponse(
  options: Pick<
    Parameters<typeof createRequestResponseMocks>[0],
    'url' | 'headers' | 'method'
  >,
  closeRequest: () => Promise<void>
) {
  const response = deferred<RscRouteStreamResponse>()
  const completion = deferred<RscRouteStreamCompletion>()
  const bodyDone = deferred<void>()
  const responseClosed = deferred<void>()
  const nativeClosed = deferred<void>()
  void response.promise.catch(() => {})
  void completion.promise.catch(() => {})

  // Node synthesizes an AbortError for reader.cancel(undefined). Give only this
  // owned bridge a unique token; the public/request cancellation reason remains
  // untouched. No other AbortError or failure is classified as cancellation.
  const cancelToken = Object.freeze({})
  // Keep the native byte bridge and its toWeb queue bounded by a real drain;
  // toWeb's default strategy otherwise counts chunks using the byte watermark.
  const native = new PassThrough({ highWaterMark: 1 })
  const reader = Readable.toWeb(native).getReader()
  const reads = new Set<ReturnType<typeof reader.read>>()
  const errors: unknown[] = []
  const seen = new WeakSet<object>()
  let output!: ReadableStreamDefaultController<Uint8Array>
  let bodyState: 'open' | 'closed' | 'errored' | 'cancelled' = 'open'
  let committed = false
  let started = false
  let finished = false
  let intentional = false
  let reason: unknown
  let contentType: string | undefined
  let finishing: Promise<RscRouteStreamCompletion> | undefined
  let disposing: Promise<void> | undefined
  let nativeCancellation: Promise<void> | undefined

  function retain(error: unknown) {
    if (
      (typeof error === 'object' && error !== null) ||
      typeof error === 'function'
    ) {
      if (seen.has(error)) return
      seen.add(error)
    }
    errors.push(error)
  }

  function rejectResponse(error: unknown) {
    if (!committed) {
      committed = true
      response.reject(error)
    }
  }

  function failBody(error: unknown) {
    if (bodyState !== 'open') return
    bodyState = 'errored'
    output.error(error)
    bodyDone.resolve()
  }

  const { req, res } = createRequestResponseMocks({
    ...options,
    resWriter: (chunk) => native.write(chunk),
  })
  void res.hasStreamed.catch(() => {})

  function commit() {
    if (committed) return
    committed = true
    res.writeHead(res.statusCode)
    const headers: Record<
      string,
      string | number | readonly string[] | undefined
    > = Object.create(null)
    for (const [name, value] of Object.entries(res.getHeaders())) {
      headers[name] = Array.isArray(value)
        ? Object.freeze(value.slice())
        : value
    }
    response.resolve(
      Object.freeze({
        status: res.statusCode,
        headers: Object.freeze(headers),
        contentType:
          contentType ??
          (typeof res.getHeader('content-type') === 'string'
            ? (res.getHeader('content-type') as string)
            : undefined),
      })
    )
  }

  const flushHeaders = res.flushHeaders.bind(res)
  res.flushHeaders = () => {
    flushHeaders()
    commit()
  }
  const onDrain = () => res.emit('drain')
  const onFinish = () => {
    commit()
    native.end()
  }
  const onResponseError = (error: Error) => {
    retain(error)
    rejectResponse(error)
    failBody(error)
    if (!native.destroyed) native.destroy(error)
  }
  const onResponseClose = () => {
    responseClosed.resolve()
    if (!res.writableFinished && !native.destroyed) native.destroy()
  }
  const onNativeError = (error: unknown) => {
    if (intentional && error === cancelToken) return
    retain(error)
    rejectResponse(error)
    failBody(error)
    if (!res.destroyed) res.destroy(error as Error)
  }
  const onNativeClose = () => {
    nativeClosed.resolve()
    if (!res.writableFinished && !res.destroyed) res.destroy()
  }
  native.on('drain', onDrain)
  native.on('error', onNativeError)
  native.on('close', onNativeClose)
  res.on('finish', onFinish)
  res.on('error', onResponseError)
  res.on('close', onResponseClose)
  const readerClosed = reader.closed.catch((error: unknown) => {
    retain(error)
    rejectResponse(error)
    failBody(error)
    if (!res.destroyed) res.destroy(error as Error)
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller
    },
    async pull(controller) {
      if (bodyState !== 'open') return
      const pending = reader.read()
      reads.add(pending)
      try {
        const item = await pending
        if (bodyState !== 'open') return
        if (item.done) {
          bodyState = 'closed'
          controller.close()
          bodyDone.resolve()
        } else {
          controller.enqueue(item.value)
        }
      } catch (error) {
        retain(error)
        rejectResponse(error)
        failBody(error)
        if (!res.destroyed) res.destroy(error as Error)
      } finally {
        reads.delete(pending)
      }
    },
    cancel(value) {
      bodyState = 'cancelled'
      bodyDone.resolve()
      return dispose(value, false)
    },
  })

  function finish(piping?: Promise<void>) {
    if (finishing) return finishing
    finishing = (async () => {
      try {
        await piping
      } catch (error) {
        retain(error)
        rejectResponse(error)
        failBody(error)
        if (!res.destroyed) res.destroy(error as Error)
        if (!native.destroyed) native.destroy(error as Error)
      }
      try {
        await closeRequest()
      } catch (error) {
        retain(error)
        rejectResponse(error)
        failBody(error)
        if (!native.destroyed) native.destroy(error as Error)
      }
      await Promise.all([
        bodyDone.promise,
        responseClosed.promise,
        nativeClosed.promise,
        readerClosed,
      ])
      if (nativeCancellation) {
        try {
          await nativeCancellation
        } catch (error) {
          retain(error)
        }
      }
      await Promise.allSettled([...reads])
      reader.releaseLock()
      native.off('drain', onDrain)
      native.off('error', onNativeError)
      native.off('close', onNativeClose)
      res.off('finish', onFinish)
      res.off('error', onResponseError)
      res.off('close', onResponseClose)
      finished = true
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) throw new RenderRequestCleanupError(errors)
      return intentional
        ? { status: 'aborted' as const, reason }
        : { status: 'completed' as const }
    })()
    void finishing.then(completion.resolve, completion.reject)
    return finishing
  }

  function dispose(value: unknown, errorReader: boolean): Promise<void> {
    if (disposing) return disposing
    if (finished) return (disposing = completion.promise.then(() => {}))
    intentional = bodyState !== 'closed'
    reason = value
    return (disposing = Promise.resolve().then(async () => {
      rejectResponse(value)
      if (errorReader) failBody(value)
      // A queued native resume can still drain buffered bytes after destroy.
      // Stop this owned readable before toWeb closes its controller.
      native.pause()
      nativeCancellation = reader.cancel(cancelToken)
      void nativeCancellation.catch(() => {})
      if (!res.writableFinished && !res.destroyed) res.destroy()
      await finish()
    }))
  }

  return {
    req,
    res,
    get started() {
      return started
    },
    get disposing() {
      return disposing !== undefined
    },
    get reason() {
      return reason
    },
    start(result: RenderResult) {
      if (started) throw new Error('The route response has already started.')
      if (disposing) throw reason
      if (errors.length) throw errors[0]
      started = true
      contentType = result.contentType ?? undefined
      const piping = result.pipeToNodeResponse(res)
      void piping.catch(() => {})
      void finish(piping)
      return {
        piping,
        result: {
          stream,
          response: response.promise,
          completed: completion.promise,
          dispose: (
            value: unknown = new DOMException(
              'Route stream disposed',
              'AbortError'
            )
          ) => dispose(value, true),
        } satisfies RscRouteStreamResult,
      }
    },
    reject(error: unknown) {
      retain(error)
      rejectResponse(error)
      failBody(error)
      return dispose(error, true)
    },
    dispose(
      value: unknown = new DOMException('Route stream disposed', 'AbortError')
    ) {
      return dispose(value, true)
    },
  }
}
