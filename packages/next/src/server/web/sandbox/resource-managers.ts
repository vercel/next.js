type ResouceManagerOpts<T, Args> = {
  create(resourceArgs: Args): T
  destroy(resource: T): void
}

function createResourceManager<T, Args extends any[]>({
  create,
  destroy,
}: ResouceManagerOpts<T, Args>) {
  let resources = new Set<T>()
  return {
    set(...resourceArgs: Args) {
      const resource = create(resourceArgs)
      resources.add(resource)
      return resource
    },

    clear(resource: T) {
      if (resources.delete(resource)) {
        destroy(resource)
      }
    },

    removeAll() {
      resources.forEach(destroy)
      resources.clear()
    },
  }
}

export function createWebTimers(
  globalObject: typeof globalThis,
  impls: {
    setInterval: typeof setInterval
    clearInterval: typeof clearInterval
    setTimeout: typeof setTimeout
    clearTimeout: typeof clearTimeout
  }
) {
  const {
    setInterval: setIntervalImpl,
    clearInterval: clearIntervalImpl,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
  } = impls

  // setInterval/clearInterval

  const webSetIntervalPolyfill = createWebSetIntervalPolyfill(
    globalObject,
    setIntervalImpl
  )

  const intervalsManager = createResourceManager<
    number,
    Parameters<typeof webSetIntervalPolyfill>
  >({
    create(args) {
      // TODO: use the edge runtime provided `setInterval` instead
      return webSetIntervalPolyfill.apply(null, args)
    },
    destroy(interval) {
      clearIntervalImpl(interval)
    },
  })

  // setTimeout/clearTimeout

  const webSetTimeoutPolyfill = createWebSetTimeoutPolyfill(
    globalObject,
    setTimeoutImpl,
    clearTimeoutImpl
  )

  const timeoutsManager = createResourceManager<
    number,
    Parameters<typeof webSetTimeoutPolyfill>
  >({
    create(args) {
      // TODO: use the edge runtime provided `setTimeout` instead
      return webSetTimeoutPolyfill.apply(null, args)
    },
    destroy(timeout) {
      clearTimeoutImpl(timeout)
    },
  })

  return {
    timers: {
      setInterval: intervalsManager.set.bind(intervalsManager),
      clearInterval: intervalsManager.clear.bind(intervalsManager),
      setTimeout: timeoutsManager.set.bind(timeoutsManager),
      clearTimeout: timeoutsManager.clear.bind(timeoutsManager),
    },
    destroy: () => {
      intervalsManager.removeAll()
      timeoutsManager.removeAll()
    },
  }
}

export type TimersManager = ReturnType<typeof createWebTimers>

function createWebSetIntervalPolyfill(
  globalObject: typeof globalThis,
  setIntervalImpl: typeof setInterval
) {
  return function setInterval<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    ms?: number,
    ...args: TArgs
  ): number {
    return setIntervalImpl(() => {
      // node's `setInterval` sets `this` to the `Timeout` instance it returned,
      // but web `setInterval` always sets `this` to `window`
      // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#the_this_problem
      return callback.apply(globalObject, args)
    }, ms)[Symbol.toPrimitive]()
  }
}

function createWebSetTimeoutPolyfill(
  globalObject: typeof globalThis,
  setTimeoutImpl: typeof setTimeout,
  clearTimeoutImpl: typeof clearTimeout
) {
  return function setTimeout<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    ms?: number,
    ...args: TArgs
  ): number {
    const wrappedCallback = () => {
      try {
        // node's `setTimeout` sets `this` to the `Timeout` instance it returned,
        // but web `setTimeout` always sets `this` to `window`
        // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#the_this_problem
        return callback.apply(globalObject, args)
      } finally {
        // On certain older node versions (<20.16.0, <22.4.0),
        // a `setTimeout` whose Timeout was converted to a primitive will leak.
        // See: https://github.com/nodejs/node/issues/53335
        // We can work around this by explicitly calling `clearTimeout` after the callback runs.
        clearTimeoutImpl(timeout)
      }
    }
    const timeout = setTimeoutImpl(wrappedCallback, ms)
    return timeout[Symbol.toPrimitive]()
  }
}
