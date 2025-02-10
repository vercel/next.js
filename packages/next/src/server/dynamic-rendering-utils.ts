import { annotateDynamicAccess } from './app-render/dynamic-rendering'
import type { PrerenderStoreModern } from './app-render/work-unit-async-storage.external'
import { ReflectAdapter } from './web/spec-extension/adapters/reflect'

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

  constructor(public readonly expression: string) {
    super(
      `During prerendering, ${expression} rejects when the prerender is complete. Typically these errors are handled by React but if you move ${expression} to a different context by using \`setTimeout\`, \`after\`, or similar functions you may observe this error and you should handle it in that context.`
    )
  }
}

/**
 * This function constructs a promise that will never resolve. This is primarily
 * useful for dynamicIO where we use promise resolution timing to determine which
 * parts of a render can be included in a prerender.
 *
 * @internal
 */
export function makeHangingPromise<T>(
  prerenderStore: PrerenderStoreModern,
  expression: string
): Promise<T> {
  const hangingPromise = new Promise<T>((_, reject) => {
    prerenderStore.renderSignal.addEventListener(
      'abort',
      () => {
        reject(new HangingPromiseRejectionError(expression))
      },
      { once: true }
    )
  })
  // We are fine if no one actually awaits this promise. We shouldn't consider this an unhandled rejection so
  // we attach a noop catch handler here to suppress this warning. If you actually await somewhere or construct
  // your own promise out of it you'll need to ensure you handle the error when it rejects.
  hangingPromise.catch(ignoreReject)

  return new Proxy(hangingPromise, {
    get: function get(target, prop, receiver) {
      if (prop === 'then' || prop === 'status') {
        const capturedError = new Error()
        Error.captureStackTrace(capturedError, get)
        annotateDynamicAccess(expression, prerenderStore, capturedError.stack)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })
}

function ignoreReject() {}
