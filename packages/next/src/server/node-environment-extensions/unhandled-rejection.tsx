/**
 * Manages unhandled rejection listeners to intelligently filter rejections
 * from aborted prerenders when cache components are enabled.
 *
 * THE PROBLEM:
 * When we abort prerenders we expect to find numerous unhandled promise rejections due to
 * things like awaiting Request data like `headers()`. The rejections are fine and should
 * not be construed as problematic so we need to avoid the appearance of a problem by
 * omitting them from the logged output.
 *
 * THE STRATEGY:
 * 1. Install a filtering unhandled rejection handler
 * 2. Intercept process event methods to capture new handlers in our internal queue
 * 3. For each rejection, check if it comes from an aborted prerender context
 * 4. If yes, suppress it. If no, delegate to all handlers in our queue
 * 5. This provides precise filtering without time-based windows
 *
 * This ensures we suppress noisy prerender-related rejections while preserving
 * normal error logging for genuine unhandled rejections.
 */

import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

type ListenerMetadata = {
  listener: NodeJS.UnhandledRejectionListener
  once: boolean
}

let filterInstalled = false

// We store the proxied listeners for unhandled rejections here.
let underlyingListeners: Array<NodeJS.UnhandledRejectionListener> = []
// We store a unique pointer to each event listener registration to track
// details like whether the listener is a once listener.
let listenerMetadata: Array<ListenerMetadata> = []

let originalProcessOn: typeof process.on
let originalProcessAddListener: typeof process.addListener
let originalProcessOnce: typeof process.once
let originalProcessRemoveListener: typeof process.removeListener
let originalProcessRemoveAllListeners: typeof process.removeAllListeners
let originalProcessListeners: typeof process.listeners
let originalProcessPrependListener: typeof process.prependListener
let originalProcessPrependOnceListener: typeof process.prependOnceListener
let originalProcessOff: typeof process.off

let didWarnPrepend = false
let didWarnRemoveAll = false

/**
 * Installs a filtering unhandled rejection handler that intelligently suppresses
 * rejections from aborted prerender contexts.
 *
 * This should be called once during server startup to install the global filter.
 */
function installUnhandledRejectionFilter(): void {
  if (filterInstalled) {
    return
  }

  // Capture existing handlers
  underlyingListeners = Array.from(process.listeners('unhandledRejection'))
  // We assume all existing handlers are not "once"
  listenerMetadata = underlyingListeners.map((l) => ({
    listener: l,
    once: false,
  }))

  // Store the original process methods
  originalProcessOn = process.on
  originalProcessAddListener = process.addListener
  originalProcessOnce = process.once
  originalProcessOff = process.off
  originalProcessRemoveListener = process.removeListener
  originalProcessRemoveAllListeners = process.removeAllListeners
  originalProcessListeners = process.listeners
  originalProcessPrependListener = process.prependListener
  originalProcessPrependOnceListener = process.prependOnceListener

  // Helper function to create a patched method that preserves toString behavior
  function patchMethod<T extends Function>(original: T, patchedImpl: T): T {
    // Preserve the original toString behavior
    Object.defineProperty(patchedImpl, 'toString', {
      value: original.toString.bind(original),
      writable: true,
      configurable: true,
    })
    return patchedImpl
  }

  // Intercept process.on to capture new unhandled rejection handlers
  process.on = patchMethod(originalProcessOn, function (
    event: string | symbol,
    listener: (...args: any[]) => void
  ) {
    if (event === 'unhandledRejection') {
      // Add new handlers to our internal queue instead of the process
      underlyingListeners.push(listener as NodeJS.UnhandledRejectionListener)
      listenerMetadata.push({ listener, once: false })
      return process
    }
    // For other events, use the original method
    return originalProcessOn.call(process, event, listener)
  } as typeof process.on)

  // Intercept process.addListener (alias for process.on)
  process.addListener = patchMethod(
    originalProcessAddListener,
    process.on as typeof originalProcessAddListener
  )

  // Intercept process.once for one-time handlers
  process.once = patchMethod(originalProcessOnce, function (
    event: string | symbol,
    listener: (...args: any[]) => void
  ) {
    if (event === 'unhandledRejection') {
      underlyingListeners.push(listener)
      listenerMetadata.push({ listener, once: true })
      return process
    }
    // For other events, use the original method
    return originalProcessOnce.call(process, event, listener)
  } as typeof process.once)

  // Intercept process.prependListener for handlers that should go first
  process.prependListener = patchMethod(
    originalProcessPrependListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        if (didWarnPrepend === false) {
          didWarnPrepend = true
          console.warn(
            'Warning: `prependListener("unhandledRejection")` called, but Next.js maintains the first listener ' +
              'which filters out unnecessary events from aborted prerenders. Your handler will be second.'
          )
        }
        // Add new handlers to the beginning of our internal queue
        underlyingListeners.unshift(
          listener as NodeJS.UnhandledRejectionListener
        )
        listenerMetadata.unshift({ listener, once: false })
        return process
      }
      // For other events, use the original method
      return originalProcessPrependListener.call(
        process,
        event as any,
        listener
      )
    } as typeof process.prependListener
  )

  // Intercept process.prependOnceListener for one-time handlers that should go first
  process.prependOnceListener = patchMethod(
    originalProcessPrependOnceListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        if (didWarnPrepend === false) {
          didWarnPrepend = true
          console.warn(
            'Warning: `prependOnceListener("unhandledRejection")` called, but Next.js maintains the first listener ' +
              'which filters out unnecessary events from aborted prerenders. Your handler will be second.'
          )
        }
        // Add to the beginning of our internal queue
        underlyingListeners.unshift(listener)
        listenerMetadata.unshift({ listener, once: true })
        return process
      }
      // For other events, use the original method
      return originalProcessPrependOnceListener.call(
        process,
        event as any,
        listener
      )
    } as typeof process.prependOnceListener
  )

  // Intercept process.removeListener
  process.removeListener = patchMethod(originalProcessRemoveListener, function (
    event: string | symbol,
    listener: (...args: any[]) => void
  ) {
    if (event === 'unhandledRejection') {
      // Check if they're trying to remove our filtering handler
      if (listener === filteringUnhandledRejectionHandler) {
        uninstallUnhandledRejectionFilter()
        return process
      }

      const index = underlyingListeners.lastIndexOf(listener)
      if (index > -1) {
        underlyingListeners.splice(index, 1)
        listenerMetadata.splice(index, 1)
      }
      return process
    }
    // For other events, use the original method
    return originalProcessRemoveListener.call(process, event, listener)
  } as typeof process.removeListener)

  // Intercept process.off (alias for process.removeListener)
  process.off = patchMethod(
    originalProcessOff,
    process.removeListener as typeof originalProcessOff
  )

  // Intercept process.removeAllListeners
  process.removeAllListeners = patchMethod(
    originalProcessRemoveAllListeners,
    function (event?: string | symbol) {
      if (event === 'unhandledRejection') {
        if (didWarnRemoveAll === false) {
          didWarnRemoveAll = true
          console.warn(
            'Warning: `removeAllListeners("unhandledRejection")` called. Next.js maintains an `unhandledRejection` listener ' +
              'to filter out unnecessary rejection warnings caused by aborting prerenders early. It is not recommended that you ' +
              'uninstall this behavior, but if you want to you must call `process.removeListener("unhandledRejection", listener)`. ' +
              'You can acquire the listener from `process.listeners("unhandledRejection")[0]`.'
          )
        }
        underlyingListeners.length = 0
        listenerMetadata.length = 0
        return process
      }

      // For other specific events, use the original method
      if (event !== undefined) {
        return originalProcessRemoveAllListeners.call(process, event)
      }

      // If no event specified (removeAllListeners()), uninstall our patch completely
      console.warn(
        'Warning: `removeAllListeners()` called - uninstalling Next.js unhandled rejection filter. ' +
          'You will observe `unhandledRejection` logs from prerendering which are not problematic.'
      )
      uninstallUnhandledRejectionFilter()
      return originalProcessRemoveAllListeners.call(process)
    } as typeof process.removeAllListeners
  )

  // Intercept process.listeners to return our internal handlers for unhandled rejection
  process.listeners = patchMethod(originalProcessListeners, function (
    event: string | symbol
  ) {
    if (event === 'unhandledRejection') {
      return [filteringUnhandledRejectionHandler, ...underlyingListeners]
    }
    return originalProcessListeners.call(process, event as any)
  } as typeof process.listeners)

  // Remove all existing handlers
  originalProcessRemoveAllListeners.call(process, 'unhandledRejection')

  // Install our filtering handler
  originalProcessOn.call(
    process,
    'unhandledRejection',
    filteringUnhandledRejectionHandler
  )

  originalProcessOn.call(process, 'rejectionHandled', noopRejectionHandled)

  filterInstalled = true
}

/**
 * Uninstalls the unhandled rejection filter and restores original process methods.
 * This is called when someone explicitly removes our filtering handler.
 * @internal
 */
function uninstallUnhandledRejectionFilter(): void {
  if (!filterInstalled) {
    return
  }

  // Restore original process methods
  process.on = originalProcessOn
  process.addListener = originalProcessAddListener
  process.once = originalProcessOnce
  process.prependListener = originalProcessPrependListener
  process.prependOnceListener = originalProcessPrependOnceListener
  process.removeListener = originalProcessRemoveListener
  process.off = originalProcessOff
  process.removeAllListeners = originalProcessRemoveAllListeners
  process.listeners = originalProcessListeners

  // Remove our filtering handler
  originalProcessRemoveListener.call(
    process,
    'unhandledRejection',
    filteringUnhandledRejectionHandler
  )

  originalProcessRemoveListener.call(
    process,
    'rejectionHandled',
    noopRejectionHandled
  )

  // Re-register all the handlers that were in our internal queue
  for (const meta of listenerMetadata) {
    if (meta.once) {
      originalProcessOnce.call(process, 'unhandledRejection', meta.listener)
    } else {
      originalProcessOn.call(process, 'unhandledRejection', meta.listener)
    }
  }

  // Reset state
  filterInstalled = false
  underlyingListeners.length = 0
  listenerMetadata.length = 0
}

/**
 * The filtering handler that decides whether to suppress or delegate unhandled rejections.
 */
function filteringUnhandledRejectionHandler(
  reason: any,
  promise: Promise<any>
): void {
  const capturedListenerMetadata = Array.from(listenerMetadata)

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime': {
        const signal = workUnitStore.renderSignal
        if (signal.aborted) {
          // This unhandledRejection is from async work spawned in a now
          // aborted prerender. We don't need to report this.
          return
        }
        break
      }
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  // Not from an aborted prerender, delegate to original handlers
  if (capturedListenerMetadata.length === 0) {
    // We need to log something because the default behavior when there is
    // no event handler installed is to trigger an Unhandled Exception.
    // We don't do that here b/c we don't want to rely on this implicit default
    // to kill the process since it can be disabled by installing a userland listener
    // and you may also choose to run Next.js with args such that unhandled rejections
    // do not automatically terminate the process.
    console.error('Unhandled Rejection:', reason)
  } else {
    try {
      for (const meta of capturedListenerMetadata) {
        if (meta.once) {
          // This is a once listener. we remove it from our set before we call it
          const index = listenerMetadata.indexOf(meta)
          if (index !== -1) {
            underlyingListeners.splice(index, 1)
            listenerMetadata.splice(index, 1)
          }
        }
        const listener = meta.listener
        listener(reason, promise)
      }
    } catch (error) {
      // If any handlers error we produce an Uncaught Exception
      setImmediate(() => {
        throw error
      })
    }
  }
}

function noopRejectionHandled() {}

// Install the filter when this module is imported
installUnhandledRejectionFilter()
