import type { ServerComponentRender } from './render'

export class RenderRequestCleanupError extends Error {
  readonly errors: readonly unknown[]

  constructor(errors: unknown[]) {
    super('Server component request cleanup failed')
    this.name = 'RenderRequestCleanupError'
    this.errors = errors.slice()
  }
}

/**
 * Compose E's Flight transport with F's real request lifecycle and C's attempt
 * cleanup. The render callback must enter F's bundle-local request scope before
 * calling renderServerComponent. The host initializes patchFetch before loading
 * the subject. Neither a React value nor these callbacks cross the worker IPC.
 */
export function renderWithRequestLifecycle(
  attempt: { onCleanup(cleanup: () => Promise<void>): void },
  lifecycle: { close(): Promise<void> },
  render: () => ServerComponentRender
): ServerComponentRender {
  let transport: ServerComponentRender | undefined
  let disposal: Promise<void> | undefined
  let closing: Promise<void> | undefined

  function close() {
    // Memoize here as well as in F so normal consumption and attempt teardown
    // share the same request completion, including its original rejection.
    return (closing ??= Promise.resolve().then(() => lifecycle.close()))
  }

  function dispose(reason?: unknown): Promise<void> {
    return (disposal ??= Promise.resolve().then(async () => {
      const errors: unknown[] = []
      try {
        await transport?.dispose(reason)
      } catch (error) {
        errors.push(error)
      }
      try {
        await close()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) {
        throw new RenderRequestCleanupError(errors)
      }
    }))
  }

  // Register first: the renderer may synchronously throw after it registered
  // after() work. C must still close and drain that request on the failure path.
  attempt.onCleanup(dispose)
  transport = render()
  const completed = transport.completed.then(async (outcome) => {
    await close()
    return outcome
  })
  // after() can fail before the test awaits completion. Cleanup still observes
  // and reports the same failure, even if the test never consumes this promise.
  void completed.catch(() => {})

  return { stream: transport.stream, completed, dispose }
}
