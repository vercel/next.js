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

type AbortListeners = Array<(err: unknown) => void>
const abortListenersBySignal = new WeakMap<AbortSignal, AbortListeners>()

/**
 * This function constructs a promise that will never resolve. This is primarily
 * useful for dynamicIO where we use promise resolution timing to determine which
 * parts of a render can be included in a prerender.
 *
 * @internal
 */
export function makeHangingPromise<T>(
  signal: AbortSignal,
  expression: string,
  handler?: ProxyHandler<Promise<T>>
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new HangingPromiseRejectionError(expression))
  } else {
    const hangingPromise = new Promise<T>((_, reject) => {
      const boundRejection = reject.bind(
        null,
        new HangingPromiseRejectionError(expression)
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

    return new Proxy(hangingPromise, {
      ...handler,
      get: function get(target, prop, receiver) {
        if (prop === 'then' || prop === 'status') {
          // TODO: Maybe annotate dynamic access here.
        }

        if (handler?.get) {
          return handler.get(target, prop, receiver)
        }

        return ReflectAdapter.get(target, prop, receiver)
      },
    })
  }
}

function ignoreReject() {}
