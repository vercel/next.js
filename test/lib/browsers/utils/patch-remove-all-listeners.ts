import type { BrowserContext } from 'playwright'

/**
 * `BrowserContext.removeAllListeners(undefined)` breaks playwright internals,
 * because it removes an internal 'close' listener that `BrowserContext.close()` depends on.
 * This function patches `removeAllListeners` to avoid that.
 */
export function patchBrowserContextRemoveAllListeners(context: BrowserContext) {
  type SomeListenerCallback = (...args: any[]) => any

  const eventTypes = new Set<string>()
  const trackEventType = (event: string) => {
    // we don't currently use the 'close' event anywhere, but it's safer to be defensive.
    if (event === 'close') {
      throw new Error(
        `Removing 'close' listeners breaks Playwright internals, so we don't allow adding them`
      )
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

  const contextRemoveAllListeners = context.removeAllListeners.bind(
    context
  ) as BrowserContext['removeAllListeners']
  context.removeAllListeners = ((
    event: string | undefined,
    options?: { behavior?: 'wait' | 'ignoreErrors' | 'default' }
  ) => {
    // `BrowserContext.removeAllListeners(undefined)` breaks playwright internals,
    // because it removes an internal 'close' listener that `BrowserContext.close()` depends on.
    // Instead, remove each event type we've seen individually.
    // We guarantee that no new 'close' listeners were added in `trackEventType`,
    // so this will sidestep the playwright bug.
    if (event === undefined) {
      // if no `options` are passed, `BrowserContext.removeAllListeners` returns `this`.
      if (!options) {
        for (const event of eventTypes) {
          contextRemoveAllListeners(event)
        }
        return context
      } else {
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
