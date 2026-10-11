import type { ComponentType } from 'react'
import type { AppPageModule } from '../../../server/route-modules/app-page/module'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'

export type ServerComponentRenderOutcome = {
  status: 'completed' | 'aborted' | 'errored'
  errors: readonly unknown[]
}

export type ServerComponentRender = {
  /** Actual Flight bytes, for a matching React decoder. Not an HTML stream. */
  stream: ReadableStream<Uint8Array>
  /** Resolves after consumption or disposal, including failed renders. */
  completed: Promise<ServerComponentRenderOutcome>
  dispose(reason?: unknown): Promise<void>
}

/**
 * Invoke inside F's request scope, with the subject bundle's ComponentMod and
 * manifests registered by the execution host. The caller registers dispose with
 * attempt cleanup. This module deliberately does not resolve React or Flight.
 *
 * Client references remain serialized references: consuming this stream does not
 * execute client components or establish anything about DOM or hydration.
 */
export function renderServerComponent<Props extends {}>(
  ComponentMod: Pick<AppPageModule, 'createElement' | 'renderToReadableStream'>,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  Component: ComponentType<Props>,
  props: Props,
  options: { signal?: AbortSignal } = {}
): ServerComponentRender {
  options.signal?.throwIfAborted()

  const controller = new AbortController()
  const errors: unknown[] = []
  const source = ComponentMod.renderToReadableStream(
    ComponentMod.createElement(Component, props),
    clientReferenceManifest.clientModules,
    {
      signal: controller.signal,
      filterStackFrame: undefined,
      onError(error: unknown) {
        errors.push(error)
      },
    }
  )
  const reader = source.getReader()
  let resolveCompleted!: (outcome: ServerComponentRenderOutcome) => void
  const completed = new Promise<ServerComponentRenderOutcome>((resolve) => {
    resolveCompleted = resolve
  })
  let settled = false
  let disposing: Promise<void> | undefined
  let output: ReadableStreamDefaultController<Uint8Array>

  function finish(status: ServerComponentRenderOutcome['status']) {
    if (settled) return
    settled = true
    options.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
    resolveCompleted({ status, errors: errors.slice() })
  }

  function dispose(
    reason: unknown = new Error('Server component render disposed')
  ) {
    if (disposing) return disposing
    if (settled) return Promise.resolve()
    // Defer cancellation until disposing is assigned, since abort can synchronously
    // wake the reader and call the renderer's error callback.
    disposing = Promise.resolve().then(async () => {
      output.error(reason)
      controller.abort(reason)
      try {
        await reader.cancel(reason)
      } catch (error) {
        errors.push(error)
        throw error
      } finally {
        finish('aborted')
      }
    })
    return disposing
  }

  function onAbort() {
    const reason = options.signal!.reason
    // The completion outcome retains any cancellation failure; this event
    // listener cannot return a promise to its caller.
    void dispose(reason).catch(() => {})
  }

  const stream = new ReadableStream<Uint8Array>({
    start(destination) {
      output = destination
    },
    async pull(destination) {
      try {
        const { done, value } = await reader.read()
        if (disposing) {
          return
        } else if (done) {
          destination.close()
          finish(errors.length ? 'errored' : 'completed')
        } else {
          destination.enqueue(value)
        }
      } catch (error) {
        if (!disposing) {
          errors.push(error)
          destination.error(error)
          finish('errored')
        }
      }
    },
    cancel: dispose,
  })
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // Abort may have occurred during the renderer call, before listener setup.
  if (options.signal?.aborted) onAbort()

  return { stream, completed, dispose }
}
