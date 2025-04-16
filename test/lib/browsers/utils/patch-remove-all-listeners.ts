import type { BrowserContext } from 'playwright'

const CONTEXT_ON_CLOSE_SYNC = Symbol('Context.onClose')

type SyncBrowserContextCloseListener = (context: BrowserContext) => void
type PatchedBrowserContext = BrowserContext & {
  [CONTEXT_ON_CLOSE_SYNC]: (listener: SyncBrowserContextCloseListener) => void
}

/**
 * `BrowserContext.removeAllListeners(undefined)` breaks playwright internals,
 * because it removes an internal 'close' listener that `BrowserContext.close()` depends on.
 * This function patches `removeAllListeners` to avoid that.
 */
export function patchBrowserContextRemoveAllListeners(context: BrowserContext) {
  if (
    (context as BrowserContext | PatchedBrowserContext)[CONTEXT_ON_CLOSE_SYNC]
  ) {
    // already patched
    return
  }

  type SomeListenerCallback = (...args: any[]) => any

  const eventTypes = new Set<string>()
  const trackEventType = (event: string) => {
    if (event === 'close') {
      // ignore 'close' events. playwright internals might add them,
      // but we don't want to remove them when calling `removeAllListeners(undefined)`.
      // in our code, we should use `addSyncCloseListener` instead.
      return
    }
    eventTypes.add(event)
  }

  // track the event types of event listeners added to BrowserContext.

  const contextOn = context.on.bind(context)
  context.on = (event: string, listener: SomeListenerCallback) => {
    trackEventType(event)
    return contextOn(event, listener)
  }

  const contextOnce = context.once.bind(context)
  context.once = (event: string, listener: SomeListenerCallback) => {
    trackEventType(event)
    return contextOnce(event, listener)
  }

  const contextAddListener = context.addListener.bind(context)
  context.addListener = (event: string, listener: SomeListenerCallback) => {
    trackEventType(event)
    return contextAddListener(event, listener)
  }

  // add a way to use `context.on('close')` IF it's sync (we don't need async and it's annoying to implement)
  const closeListeners: SyncBrowserContextCloseListener[] = []
  const addSyncCloseListener = (listener: SyncBrowserContextCloseListener) => {
    closeListeners.push(listener)
    context.on('close', listener)
  }
  ;(context as PatchedBrowserContext)[CONTEXT_ON_CLOSE_SYNC] =
    addSyncCloseListener
  const removeSyncCloseListeners = () => {
    for (const listener of closeListeners) {
      context.off('close', listener)
    }
  }

  const contextRemoveAllListeners = context.removeAllListeners.bind(
    context
  ) as BrowserContext['removeAllListeners']
  context.removeAllListeners = ((
    event: string | undefined,
    options?: {
      behavior?: 'wait' | 'ignoreErrors' | 'default'
    }
  ) => {
    // `BrowserContext.removeAllListeners(undefined)` breaks playwright internals,
    // because it removes an internal 'close' listener that `BrowserContext.close()` depends on.
    // Instead, remove each event type we've seen individually.
    // We guarantee that no new 'close' listeners were added in `trackEventType`,
    // so this will sidestep the playwright bug.
    if (event === undefined) {
      // if no `options` are passed, `BrowserContext.removeAllListeners` returns `this`.
      if (!options) {
        removeSyncCloseListeners()
        for (const event of eventTypes) {
          contextRemoveAllListeners(event)
        }
        return context
      } else {
        removeSyncCloseListeners()
        // if an `options` object is passed, `BrowserContext.removeAllListeners` returns a promise.
        return Promise.all(
          [...eventTypes.values()].map((event) =>
            contextRemoveAllListeners(event, options)
          )
        ).then(() => {})
      }
    } else {
      // playwright's types don't let us pass `undefined` as the second argument
      return options
        ? contextRemoveAllListeners(event, options)
        : contextRemoveAllListeners(event)
    }
  }) as BrowserContext['removeAllListeners']
}

export function addSyncCloseListener(
  context: BrowserContext,
  listener: SyncBrowserContextCloseListener
): void {
  const impl = (context as PatchedBrowserContext)[CONTEXT_ON_CLOSE_SYNC]
  impl(listener)
}
