import type { NonStaticRenderStage } from './app-render/staged-rendering'
import type { RequestStore } from './app-render/work-unit-async-storage.external'

export function isHangingPromiseRejectionError(
  err: unknown
): err is HangingPromiseRejectionError {
  if (typeof err !== 'object' || err === null || !('digest' in err)) {
    return false
  }

  return err.digest === HANGING_PROMISE_REJECTION
}

const HANGING_PROMISE_REJECTION = 'HANGING_PROMISE_REJECTION'

class HangingPromiseRejectionError extends Error {
  public readonly digest = HANGING_PROMISE_REJECTION

  constructor(
    public readonly route: string,
    public readonly expression: string
  ) {
    super(
      `During prerendering, ${expression} rejects when the prerender is complete. Typically these errors are handled by React but if you move ${expression} to a different context by using \`setTimeout\`, \`after\`, or similar functions you may observe this error and you should handle it in that context. This occurred at route "${route}".`
    )
  }
}

type AbortListeners = Array<(err: unknown) => void>
const abortListenersBySignal = new WeakMap<AbortSignal, AbortListeners>()

/**
 * This function constructs a promise that will never resolve. This is primarily
 * useful for cacheComponents where we use promise resolution timing to determine which
 * parts of a render can be included in a prerender.
 *
 * @internal
 */
export function makeHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new HangingPromiseRejectionError(route, expression))
  } else {
    const hangingPromise = new Promise<T>((_, reject) => {
      const boundRejection = reject.bind(
        null,
        new HangingPromiseRejectionError(route, expression)
      )
      let currentListeners = abortListenersBySignal.get(signal)
      if (currentListeners) {
        currentListeners.push(boundRejection)
      } else {
        const listeners = [boundRejection]
        abortListenersBySignal.set(signal, listeners)
        signal.addEventListener(
          'abort',
          () => {
            for (let i = 0; i < listeners.length; i++) {
              listeners[i]()
            }
          },
          { once: true }
        )
      }
    })
    // We are fine if no one actually awaits this promise. We shouldn't consider this an unhandled rejection so
    // we attach a noop catch handler here to suppress this warning. If you actually await somewhere or construct
    // your own promise out of it you'll need to ensure you handle the error when it rejects.
    hangingPromise.catch(ignoreReject)
    return hangingPromise
  }
}

function ignoreReject() {}

export function makeDevtoolsIOAwarePromise<T>(
  underlying: T,
  requestStore: RequestStore,
  stage: NonStaticRenderStage
): Promise<T> {
  if (requestStore.stagedRendering) {
    // We resolve each stage in a timeout, so React DevTools will pick this up as IO.
    return requestStore.stagedRendering.delayUntilStage(
      stage,
      undefined,
      underlying
    )
  }
  // in React DevTools if we resolve in a setTimeout we will observe
  // the promise resolution as something that can suspend a boundary or root.
  return new Promise<T>((resolve) => {
    // Must use setTimeout to be considered IO React DevTools. setImmediate will not work.
    setTimeout(() => {
      resolve(underlying)
    }, 0)
  })
}
