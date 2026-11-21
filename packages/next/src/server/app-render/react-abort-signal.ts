/**
 * Wraps an `AbortSignal` that is passed to a React render (`prerender`,
 * `renderToReadableStream`, ...) as its `signal` option.
 *
 * React registers the listener that aborts the render with
 * `signal.addEventListener('abort', listener, { signal: lifetime })`, where
 * `lifetime` is a signal of its own that fires when the render ends, so that
 * the listener is removed then. Node.js implements that option with a weak
 * listener on `lifetime`: a `WeakRef`, an entry in a `FinalizationRegistry`
 * and an entry in a module-level `WeakMap` whose value reaches its key. A
 * scavenge treats all of them as strong references, so the signal, the
 * listener and the whole render request the listener closes over survive
 * every scavenge and are promoted. Only a major GC frees them.
 *
 * React reads `aborted` and `reason` and calls `addEventListener` on the
 * signal it is given, and does not check its type. This object forwards
 * those to the real signal and implements the `signal` option with a second,
 * plain listener, which removes the first one at the same moment as the
 * option would.
 */
class ReactAbortSignal {
  private readonly signal: AbortSignal

  constructor(signal: AbortSignal) {
    this.signal = signal
  }

  get aborted(): boolean {
    return this.signal.aborted
  }

  get reason(): unknown {
    return this.signal.reason
  }

  addEventListener(
    type: string,
    listener: () => void,
    options?: { signal?: AbortSignal }
  ): void {
    const signal = this.signal
    const lifetime = options !== undefined ? options.signal : undefined
    if (lifetime === undefined) {
      signal.addEventListener(type, listener)
      return
    }
    if (lifetime.aborted) {
      // With the option, a listener is not added once its signal has fired.
      return
    }
    signal.addEventListener(type, listener)
    lifetime.addEventListener(
      'abort',
      removeListener.bind(null, signal, type, listener),
      { once: true }
    )
  }
}

function removeListener(
  signal: AbortSignal,
  type: string,
  listener: () => void
): void {
  signal.removeEventListener(type, listener)
}

/**
 * Returns the object to pass to a React render as its `signal` option in
 * place of `signal`. It is not an `AbortSignal` and must not be used for
 * anything else: abort the render through the real signal, and read
 * `aborted` and `reason` from the real signal.
 */
export function signalForReact(signal: AbortSignal): AbortSignal {
  return new ReactAbortSignal(signal) as unknown as AbortSignal
}
