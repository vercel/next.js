import * as Log from '../../build/output/log'

let _global = globalThis as typeof globalThis & {
  nextInitializedProcessErrorHandlers?: boolean
  [UNHANDLED_REJECTION_LISTENER_KEY]?: NodeJS.UnhandledRejectionListener
}

// The listener function is shared via globalThis so that multiple copies of
// this module (e.g. in the pre-compiled server bundle and in a route module
// bundle) still register and detect a single listener instance.
const UNHANDLED_REJECTION_LISTENER_KEY = Symbol.for(
  'next.unhandledRejectionListener'
)

function unhandledRejectionListener(reason: unknown) {
  // Immediately log the error.
  // TODO: Ideally, if we knew that this error was triggered by application
  // code, we would suppress it entirely without logging. We can't reliably
  // detect all of these, but when cacheComponents is enabled, we could suppress
  // at least some of them by waiting to log the error until after all in-
  // progress renders have completed. Then, only log errors for which there
  // was not a corresponding "rejectionHandled" event.
  Log.error('unhandledRejection:', reason)
}

/**
 * Checks if the Next.js unhandled rejection listener is currently attached.
 * This queries the actual process listeners instead of relying on a module
 * global, so it stays accurate even if the listener was removed externally,
 * e.g. via `process.removeAllListeners('unhandledRejection')`.
 */
export function isUnhandledRejectionListenerRegistered(): boolean {
  const listener = _global[UNHANDLED_REJECTION_LISTENER_KEY]

  return (
    listener !== undefined &&
    process.listeners('unhandledRejection').includes(listener)
  )
}

/**
 * Registers the Next.js unhandled rejection listener, which logs unhandled
 * rejections and prevents them from crashing the process. Safe to call
 * unconditionally: if the listener is already attached, this is a no-op, so it
 * never registers a duplicate.
 */
export function registerUnhandledRejectionListener(): void {
  if (isUnhandledRejectionListenerRegistered()) {
    return
  }

  const listener = (_global[UNHANDLED_REJECTION_LISTENER_KEY] ??=
    unhandledRejectionListener)

  process.on('unhandledRejection', listener)
}

/**
 * Checks if an error was raised by a failed write to stdout/stderr, e.g. when
 * the terminal the process is attached to has gone away (`EIO`, `EPIPE`).
 *
 * Logging such an error with `console.error` writes to the same broken stream,
 * which fails again, triggers another "uncaughtException" and so on, looping
 * forever at 100% CPU.
 *
 * Only errors that happen while stdout or stderr is actually broken (already
 * destroyed or no longer writable) are treated this way. An EPIPE/EIO write
 * error from anywhere else (e.g. a socket) is a regular error and must still be
 * logged while the console is healthy.
 */
function isConsoleWriteError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const { code, syscall } = error as { code?: unknown; syscall?: unknown }
  if (syscall !== 'write' || (code !== 'EIO' && code !== 'EPIPE')) {
    return false
  }
  return [process.stdout, process.stderr].some(
    (stream) => stream.destroyed || !stream.writable
  )
}

export function installProcessErrorHandlers(
  shouldRemoveUncaughtErrorAndRejectionListeners: boolean
) {
  if (!_global.nextInitializedProcessErrorHandlers) {
    _global.nextInitializedProcessErrorHandlers = true
    // The conventional wisdom of Node.js and other runtimes is to treat
    // unhandled errors as fatal and exit the process.
    //
    // But Next.js is not a generic JS runtime — it's a specialized runtime for
    // React Server Components.
    //
    // Many unhandled rejections are due to the late-awaiting pattern for
    // prefetching data. In Next.js it's OK to call an async function without
    // immediately awaiting it, to start the request as soon as possible
    // without blocking unncessarily on the result. These can end up
    // triggering an "unhandledRejection" if it later turns out that the
    // data is not needed to render the page. Example:
    //
    //     const promise = fetchData()
    //     const shouldShow = await checkCondition()
    //     if (shouldShow) {
    //       return <Component promise={promise} />
    //     }
    //
    // In this example, `fetchData` is called immediately to start the request
    // as soon as possible, but if `shouldShow` is false, then it will be
    // discarded without unwrapping its result. If it errors, it will trigger
    // an "unhandledRejection" event.
    //
    // Ideally, we would suppress these rejections completely without warning,
    // because we don't consider them real errors. (TODO: Currently we do warn.)
    //
    // But regardless of whether we do or don't warn, we definitely shouldn't
    // crash the entire process.
    //
    // Even a "legit" unhandled error unrelated to prefetching shouldn't
    // prevent the rest of the page from rendering.
    //
    // So, we're going to intentionally override the default error handling
    // behavior of the outer JS runtime to be more forgiving

    // Remove any existing "unhandledRejection" and "uncaughtException" handlers.
    // This is gated behind an experimental flag until we've considered the impact
    // in various deployment environments. It's possible this may always need to
    // be configurable.
    if (shouldRemoveUncaughtErrorAndRejectionListeners) {
      process.removeAllListeners('uncaughtException')
      process.removeAllListeners('unhandledRejection')
    }

    process.on('rejectionHandled', () => {
      // TODO: See note in the unhandledRejection listener above. In the
      // future, we may use the "rejectionHandled" event to de-queue an error
      // from being logged.
    })

    // Unhandled exceptions are errors triggered by non-async functions, so this
    // is unrelated to the late-awaiting pattern. However, for similar reasons,
    // we still shouldn't crash the process. Just log it.
    process.on('uncaughtException', (reason: unknown) => {
      // Don't log failed writes to stdout/stderr: logging would write to the
      // same broken stream again and re-enter this handler in an endless loop.
      if (isConsoleWriteError(reason)) {
        return
      }
      console.error(reason)
    })
  }

  // Register the listener unconditionally, and not only during the guarded
  // initialization above: a previous registration may have been undone by the
  // `removeAllListeners` call of a later `installProcessErrorHandlers` call
  // (or by external code), and registering is a no-op if the listener is
  // still attached.
  registerUnhandledRejectionListener()
}
