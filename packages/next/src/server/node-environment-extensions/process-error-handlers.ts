import { isPostpone } from '../lib/router-utils/is-postpone'

let _global = globalThis as typeof globalThis & {
  nextInitializedProcessErrorHandlers?: boolean
}

export function installProcessErrorHandlers(
  shouldRemoveUncaughtErrorAndRejectionListeners: boolean
) {
  if (_global.nextInitializedProcessErrorHandlers) return
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

  // Install a new handler to prevent the process from crashing.
  process.on('unhandledRejection', (reason: unknown) => {
    if (isPostpone(reason)) {
      // React postpones that are unhandled might end up logged here but they're
      // not really errors. They're just part of rendering.
      return
    }
    // Immediately log the error.
    // TODO: Ideally, if we knew that this error was triggered by application
    // code, we would suppress it entirely without logging. We can't reliably
    // detect all of these, but when cacheComponents is enabled, we could suppress
    // at least some of them by waiting to log the error until after all in-
    // progress renders have completed. Then, only log errors for which there
    // was not a corresponding "rejectionHandled" event.
    console.error(reason)
  })

  process.on('rejectionHandled', () => {
    // TODO: See note in the unhandledRejection handler above. In the future,
    // we may use the "rejectionHandled" event to de-queue an error from
    // being logged.
  })

  // Unhandled exceptions are errors triggered by non-async functions, so this
  // is unrelated to the late-awaiting pattern. However, for similar reasons,
  // we still shouldn't crash the process. Just log it.
  process.on('uncaughtException', (reason: unknown) => {
    if (isPostpone(reason)) {
      return
    }
    console.error(reason)
  })
}
