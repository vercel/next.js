abstract class ResourceManager<T, Args> {
  private resources: T[] = []

  abstract create(resourceArgs: Args): T
  abstract destroy(resource: T): void

  add(resourceArgs: Args) {
    const resource = this.create(resourceArgs)
    this.resources.push(resource)
    return resource
  }

  remove(resource: T) {
    this.resources = this.resources.filter((r) => r !== resource)
    this.destroy(resource)
  }

  removeAll() {
    this.resources.forEach(this.destroy)
    this.resources = []
  }
}

class IntervalsManager extends ResourceManager<
  number,
  Parameters<typeof setInterval>
> {
  create(args: Parameters<typeof setInterval>) {
    // TODO: use the edge runtime provided `setInterval` instead
    return webSetIntervalPolyfill(...args)
  }

  destroy(interval: number) {
    clearInterval(interval)
  }
}

class TimeoutsManager extends ResourceManager<
  number,
  Parameters<typeof setTimeout>
> {
  create(args: Parameters<typeof setTimeout>) {
    // TODO: use the edge runtime provided `setTimeout` instead
    return webSetTimeoutPolyfill(...args)
  }

  destroy(timeout: number) {
    clearTimeout(timeout)
  }
}

function webSetIntervalPolyfill<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  ms?: number,
  ...args: TArgs
): number {
  return setInterval(() => {
    // node's `setInterval` sets `this` to the `Timeout` instance it returned,
    // but web `setInterval` always sets `this` to `window`
    // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#the_this_problem
    return callback.apply(globalThis, args)
  }, ms)[Symbol.toPrimitive]()
}

function webSetTimeoutPolyfill<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  ms?: number,
  ...args: TArgs
): number {
  const wrappedCallback = () => {
    try {
      // node's `setTimeout` sets `this` to the `Timeout` instance it returned,
      // but web `setTimeout` always sets `this` to `window`
      // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#the_this_problem
      return callback.apply(globalThis, args)
    } finally {
      // On certain older node versions (<20.16.0, <22.4.0),
      // a `setTimeout` whose Timeout was converted to a primitive will leak.
      // See: https://github.com/nodejs/node/issues/53335
      // We can work around this by explicitly calling `clearTimeout` after the callback runs.
      clearTimeout(timeout)
    }
  }
  const timeout = setTimeout(wrappedCallback, ms)
  return timeout[Symbol.toPrimitive]()
}

export const intervalsManager = new IntervalsManager()
export const timeoutsManager = new TimeoutsManager()
