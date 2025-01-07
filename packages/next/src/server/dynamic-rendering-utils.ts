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
  signal: AbortSignal,
  expression: string
): Promise<T> {
  const hangingPromise = new Promise<T>((_, reject) => {
    signal.addEventListener(
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
  return hangingPromise
}

function ignoreReject() {}
