const nativeAddEventListener = EventTarget.prototype.addEventListener
const nativeRemoveEventListener = EventTarget.prototype.removeEventListener
const nativeDispatchEvent = EventTarget.prototype.dispatchEvent
const registrationEvents = ['addMethod', 'addProperty', 'addChainableMethod']

/** A file's native EventTarget, fed by the genuine Chai registration events. */
export function createChaiEvents(
  source: EventTarget,
  assertAccess: () => void,
  originalCallback: (callback: unknown) => unknown
) {
  const target = new EventTarget()
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  let disposed = false
  function active() {
    assertAccess()
    if (disposed) throw new Error('Chai events belong to a disposed test file')
  }
  Object.defineProperties(target, {
    addEventListener: {
      configurable: true,
      writable: true,
      value: function addEventListener(
        this: EventTarget,
        type: unknown,
        listener: EventListenerOrEventListenerObject | null,
        _options: boolean | AddEventListenerOptions | undefined = undefined
      ) {
        active()
        let selectedType: string | undefined
        const objectType =
          type !== null &&
          (typeof type === 'object' || typeof type === 'function')
        // Let the native method decide whether and when to coerce the type,
        // after its ordinary options/listener checks. Remember that one result
        // so cleanup never invokes a caller's changed toString again.
        const nativeType =
          this === target && listener && objectType
            ? { toString: () => (selectedType = String(type)) }
            : type
        const args = Array.from(arguments)
        if (args.length) args[0] = nativeType
        const result = Reflect.apply(nativeAddEventListener, this, args)
        if (
          this === target &&
          listener &&
          (!objectType || selectedType !== undefined)
        ) {
          const name = selectedType ?? String(type)
          let callbacks = listeners.get(name)
          if (!callbacks) listeners.set(name, (callbacks = new Set()))
          callbacks.add(listener)
        }
        return result
      },
    },
    removeEventListener: {
      configurable: true,
      writable: true,
      value: function removeEventListener(
        this: EventTarget,
        _type: string,
        _listener: EventListenerOrEventListenerObject | null,
        _options: boolean | EventListenerOptions | undefined = undefined
      ) {
        active()
        return Reflect.apply(nativeRemoveEventListener, this, arguments)
      },
    },
    dispatchEvent: {
      configurable: true,
      writable: true,
      value: function dispatchEvent(this: EventTarget, _event: Event) {
        active()
        return Reflect.apply(nativeDispatchEvent, this, arguments)
      },
    },
  })
  function forward(original: Event) {
    active()
    const event = new Event(original.type, {
      bubbles: original.bubbles,
      cancelable: original.cancelable,
      composed: original.composed,
    })
    Object.setPrototypeOf(event, Object.getPrototypeOf(original))
    for (const key of ['name', 'fn', 'chainingBehavior']) {
      const descriptor = Object.getOwnPropertyDescriptor(original, key)
      if (!descriptor) continue
      if (key !== 'name' && 'value' in descriptor)
        descriptor.value = originalCallback(descriptor.value)
      Object.defineProperty(event, key, descriptor)
    }
    return Reflect.apply(nativeDispatchEvent, target, [event])
  }
  const attached: string[] = []
  try {
    for (const type of registrationEvents) {
      Reflect.apply(nativeAddEventListener, source, [type, forward])
      attached.push(type)
    }
  } catch (error) {
    for (const type of attached)
      Reflect.apply(nativeRemoveEventListener, source, [type, forward])
    throw error
  }
  return {
    target,
    dispose() {
      if (disposed) return
      disposed = true
      const errors: unknown[] = []
      for (const type of attached) {
        try {
          Reflect.apply(nativeRemoveEventListener, source, [type, forward])
        } catch (error) {
          errors.push(error)
        }
      }
      for (const [type, callbacks] of listeners) {
        for (const callback of callbacks) {
          // Remove both native capture registrations without reading the user's
          // options again. once/signal/dedup are handled by EventTarget itself.
          for (const capture of [false, true]) {
            try {
              Reflect.apply(nativeRemoveEventListener, target, [
                type,
                callback,
                { capture },
              ])
            } catch (error) {
              errors.push(error)
            }
          }
        }
      }
      listeners.clear()
      if (errors.length)
        throw new AggregateError(errors, 'Chai event listener cleanup failed')
    },
  }
}
