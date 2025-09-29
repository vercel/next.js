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

const MODE:
  | 'enabled'
  | 'debug'
  | 'true'
  | 'false'
  | '1'
  | '0'
  | ''
  | string
  | undefined = process.env.NEXT_USE_UNHANDLED_REJECTION_FILTER

let ENABLE_UHR_FILTER = true
let DEBUG_UHR_FILTER = false

switch (MODE) {
  case 'debug':
    DEBUG_UHR_FILTER = true
    break
  case 'false':
  case 'disabled':
  case '0':
    ENABLE_UHR_FILTER = false
    break
  case '':
  case undefined:
  case 'enabled':
  case 'true':
  case '1':
    break
  default:
    if (typeof MODE === 'string') {
      console.error(
        `NEXT_USE_UNHANDLED_REJECTION_FILTER has an unrecognized value: ${JSON.stringify(MODE)}. Use "enabled", "disabled", or "debug" or omit the environment variable altogether`
      )
    }
}

const debug = DEBUG_UHR_FILTER
  ? (...args: any[]) =>
      console.log('[UNHANDLED REJECTION DEBUG]', ...args, new Error().stack)
  : undefined

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

// These methods are used to restore the original implementations when uninstalling the patch
let originalProcessAddListener: typeof process.addListener
let originalProcessRemoveListener: typeof process.removeListener
let originalProcessOn: typeof process.on
let originalProcessOff: typeof process.off
let originalProcessPrependListener: typeof process.prependListener
let originalProcessOnce: typeof process.once
let originalProcessPrependOnceListener: typeof process.prependOnceListener
let originalProcessRemoveAllListeners: typeof process.removeAllListeners
let originalProcessListeners: typeof process.listeners

type UnderlyingMethod =
  | typeof originalProcessAddListener
  | typeof originalProcessRemoveListener
  | typeof originalProcessOn
  | typeof originalProcessOff
  | typeof originalProcessPrependListener
  | typeof originalProcessOnce
  | typeof originalProcessPrependOnceListener
  | typeof originalProcessRemoveAllListeners
  | typeof originalProcessListeners

let didWarnPrepend = false
let didWarnRemoveAll = false

// Some of these base methods call others and we don't want them to call the patched version so we
// need a way to synchronously disable the patch temporarily.
let bypassPatch = false

// This patch ensures that if any patched methods end up calling other methods internally they will
// bypass the patch during their execution. This is important for removeAllListeners in particular
// because it calls removeListener internally and we want to ensure it actually clears the listeners
// from the process queue and not our private queue.
function patchWithoutReentrancy<T extends UnderlyingMethod>(
  original: T,
  patchedImpl: T
): T {
  // Produce a function which has the correct name
  const patched = {
    [original.name]: function (...args: Parameters<T>) {
      if (bypassPatch) {
        return Reflect.apply(original, process, args)
      }

      const previousBypassPatch = bypassPatch
      bypassPatch = true
      try {
        return Reflect.apply(patchedImpl, process, args)
      } finally {
        bypassPatch = previousBypassPatch
      }
    } as any,
  }[original.name]

  // Preserve the original toString behavior
  Object.defineProperty(patched, 'toString', {
    value: original.toString.bind(original),
    writable: true,
    configurable: true,
  })

  return patched
}

/**
 * Installs a filtering unhandled rejection handler that intelligently suppresses
 * rejections from aborted prerender contexts.
 *
 * This should be called once during server startup to install the global filter.
 */
function installUnhandledRejectionFilter(): void {
  if (filterInstalled) {
    debug?.('unexpected second install')
    return
  }

  debug?.(
    'installUnhandledRejectionFilter',
    process.listeners('unhandledRejection').map((l) => l.toString())
  )

  // Capture existing handlers
  underlyingListeners = Array.from(process.listeners('unhandledRejection'))
  // We assume all existing handlers are not "once"
  listenerMetadata = underlyingListeners.map((l) => ({
    listener: l,
    once: false,
  }))

  // Remove all existing handlers
  process.removeAllListeners('unhandledRejection')

  // Install our filtering handler
  process.addListener('unhandledRejection', filteringUnhandledRejectionHandler)

  // Store the original process methods
  originalProcessAddListener = process.addListener
  originalProcessRemoveListener = process.removeListener
  originalProcessOn = process.on
  originalProcessOff = process.off
  originalProcessPrependListener = process.prependListener
  originalProcessOnce = process.once
  originalProcessPrependOnceListener = process.prependOnceListener
  originalProcessRemoveAllListeners = process.removeAllListeners
  originalProcessListeners = process.listeners

  process.addListener = patchWithoutReentrancy(
    originalProcessAddListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        debug?.('process.addListener', listener.toString())
        // Add new handlers to our internal queue instead of the process
        underlyingListeners.push(listener as NodeJS.UnhandledRejectionListener)
        listenerMetadata.push({ listener, once: false })
        return process
      }
      // For other events, use the original method
      return originalProcessAddListener.call(process, event as any, listener)
    } as typeof process.addListener
  )

  // Intercept process.removeListener (alias for process.off)
  process.removeListener = patchWithoutReentrancy(
    originalProcessRemoveListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        debug?.('process.removeListener', listener.toString())
        // Check if they're trying to remove our filtering handler
        if (listener === filteringUnhandledRejectionHandler) {
          uninstallUnhandledRejectionFilter()
          return process
        }

        const index = underlyingListeners.lastIndexOf(listener)
        if (index > -1) {
          debug?.('process.removeListener match found', index)
          underlyingListeners.splice(index, 1)
          listenerMetadata.splice(index, 1)
        } else {
          debug?.('process.removeListener match not found', index)
        }
        return process
      }
      // For other events, use the original method
      return originalProcessRemoveListener.call(process, event, listener)
    } as typeof process.removeListener
  )

  // If the process.on is referentially process.addListener then share the patched version as well
  if (originalProcessOn === originalProcessAddListener) {
    process.on = process.addListener
  } else {
    process.on = patchWithoutReentrancy(originalProcessOn, function (
      event: string | symbol,
      listener: (...args: any[]) => void
    ) {
      if (event === 'unhandledRejection') {
        debug?.('process.on', listener.toString())
        // Add new handlers to our internal queue instead of the process
        underlyingListeners.push(listener as NodeJS.UnhandledRejectionListener)
        listenerMetadata.push({ listener, once: false })
        return process
      }
      // For other events, use the original method
      return originalProcessOn.call(process, event, listener)
    } as typeof process.on)
  }

  // If the process.off is referentially process.addListener then share the patched version as well
  if (originalProcessOff === originalProcessRemoveListener) {
    process.off = process.removeListener
  } else {
    process.off = patchWithoutReentrancy(originalProcessOff, function (
      event: string | symbol,
      listener: (...args: any[]) => void
    ) {
      if (event === 'unhandledRejection') {
        debug?.('process.off', listener.toString())
        // Check if they're trying to remove our filtering handler
        if (listener === filteringUnhandledRejectionHandler) {
          uninstallUnhandledRejectionFilter()
          return process
        }

        const index = underlyingListeners.lastIndexOf(listener)
        if (index > -1) {
          debug?.('process.off match found', index)
          underlyingListeners.splice(index, 1)
          listenerMetadata.splice(index, 1)
        } else {
          debug?.('process.off match not found', index)
        }
        return process
      }
      // For other events, use the original method
      return originalProcessOff.call(process, event, listener)
    } as typeof process.off)
  }

  // Intercept process.prependListener for handlers that should go first
  process.prependListener = patchWithoutReentrancy(
    originalProcessPrependListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        debug?.('process.prependListener', listener.toString())
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

  // Intercept process.once for one-time handlers
  process.once = patchWithoutReentrancy(originalProcessOnce, function (
    event: string | symbol,
    listener: (...args: any[]) => void
  ) {
    if (event === 'unhandledRejection') {
      debug?.('process.once', listener.toString())
      underlyingListeners.push(listener as NodeJS.UnhandledRejectionListener)
      listenerMetadata.push({
        listener: listener as NodeJS.UnhandledRejectionListener,
        once: true,
      })
      return process
    }
    // For other events, use the original method
    return originalProcessOnce.call(process, event, listener)
  } as typeof process.once)

  // Intercept process.prependOnceListener for one-time handlers that should go first
  process.prependOnceListener = patchWithoutReentrancy(
    originalProcessPrependOnceListener,
    function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === 'unhandledRejection') {
        debug?.('process.prependOnceListener', listener.toString())
        if (didWarnPrepend === false) {
          didWarnPrepend = true
          console.warn(
            'Warning: `prependOnceListener("unhandledRejection")` called, but Next.js maintains the first listener ' +
              'which filters out unnecessary events from aborted prerenders. Your handler will be second.'
          )
        }
        // Add to the beginning of our internal queue
        underlyingListeners.unshift(
          listener as NodeJS.UnhandledRejectionListener
        )
        listenerMetadata.unshift({
          listener: listener as NodeJS.UnhandledRejectionListener,
          once: true,
        })
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

  // Intercept process.removeAllListeners
  process.removeAllListeners = patchWithoutReentrancy(
    originalProcessRemoveAllListeners,
    function (event?: string | symbol) {
      if (event === 'unhandledRejection') {
        debug?.(
          'process.removeAllListeners',
          underlyingListeners.map((l) => l.toString())
        )
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
  process.listeners = patchWithoutReentrancy(
    originalProcessListeners,
    function (event: string | symbol) {
      if (event === 'unhandledRejection') {
        debug?.(
          'process.listeners',
          [filteringUnhandledRejectionHandler, ...underlyingListeners].map(
            (l) => l.toString()
          )
        )
        return [filteringUnhandledRejectionHandler, ...underlyingListeners]
      }
      return originalProcessListeners.call(process, event as any)
    } as typeof process.listeners
  )

  filterInstalled = true

  debug?.(
    'after install actual listeners',
    originalProcessListeners
      .call(process, 'unhandledRejection' as any)
      .map((l) => l.toString())
  )

  debug?.(
    'after install listeners',
    process.listeners('unhandledRejection').map((l) => l.toString())
  )
}

/**
 * Uninstalls the unhandled rejection filter and restores original process methods.
 * This is called when someone explicitly removes our filtering handler.
 * @internal
 */
function uninstallUnhandledRejectionFilter(): void {
  if (!filterInstalled) {
    debug?.('unexpected second uninstall')
    return
  }

  debug?.(
    'uninstallUnhandledRejectionFilter',
    [filteringUnhandledRejectionHandler, ...underlyingListeners].map((l) =>
      l.toString()
    )
  )

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
  process.removeListener(
    'unhandledRejection',
    filteringUnhandledRejectionHandler
  )

  // Re-register all the handlers that were in our internal queue
  for (const meta of listenerMetadata) {
    if (meta.once) {
      process.once('unhandledRejection', meta.listener)
    } else {
      process.addListener('unhandledRejection', meta.listener)
    }
  }

  // Reset state
  filterInstalled = false
  underlyingListeners.length = 0
  listenerMetadata.length = 0

  debug?.(
    'after uninstall',
    process.listeners('unhandledRejection').map((l) => l.toString())
  )
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

// Install the filter when this module is imported
if (ENABLE_UHR_FILTER) {
  installUnhandledRejectionFilter()
}
