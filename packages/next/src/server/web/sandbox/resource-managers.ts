abstract class ResourceManager<T, Args> {
  private resources = new Set<T>()

  abstract create(resourceArgs: Args): T
  abstract destroy(resource: T): void

  add(resourceArgs: Args) {
    const resource = this.create(resourceArgs)
    this.resources.add(resource)
    return resource
  }

  remove(resource: T) {
    this.untrack(resource)
    this.destroy(resource)
  }

  /**
   * Stop tracking a resource without destroying it. Used when a resource has
   * already been released by other means (e.g. a one-shot timeout that ran to
   * completion) so it should no longer be retained by this manager.
   */
  protected untrack(resource: T) {
    this.resources.delete(resource)
  }

  removeAll() {
    for (const resource of this.resources) {
      this.destroy(resource)
    }
    this.resources.clear()
  }

  /** Number of resources currently tracked. Exposed for observability/tests. */
  get size() {
    return this.resources.size
  }
}

export class IntervalsManager extends ResourceManager<
  number,
  Parameters<typeof webSetIntervalPolyfill>
> {
  create(args: Parameters<typeof webSetIntervalPolyfill>) {
    // TODO: use the edge runtime provided `setInterval` instead
    return webSetIntervalPolyfill(...args)
  }

  destroy(interval: number) {
    clearInterval(interval)
  }
}

export class TimeoutsManager extends ResourceManager<
  number,
  Parameters<typeof webSetTimeoutPolyfill>
> {
  create(args: Parameters<typeof webSetTimeoutPolyfill>) {
    // TODO: use the edge runtime provided `setTimeout` instead
    const [globalObject, callback, ms, ...rest] = args

    // A one-shot timeout releases itself from tracking once its callback has
    // run. Otherwise fire-and-forget timeouts (whose ids user code never
    // passes to `clearTimeout`) would accumulate for the lifetime of the
    // module context and leak memory in long-lived server processes.
    // See: https://github.com/vercel/next.js/issues/95094
    let timeoutId: number
    const callbackWithRelease = (...callbackArgs: typeof rest) => {
      try {
        return callback.apply(globalObject, callbackArgs)
      } finally {
        this.untrack(timeoutId)
      }
    }

    timeoutId = webSetTimeoutPolyfill(
      globalObject,
      callbackWithRelease,
      ms,
      ...rest
    )
    return timeoutId
  }

  destroy(timeout: number) {
    clearTimeout(timeout)
  }
}

export type GlobalObject = import('edge-runtime').EdgeRuntime['context']

function webSetIntervalPolyfill<TArgs extends any[]>(
  globalObject: GlobalObject,
  callback: (...args: TArgs) => void,
  ms?: number,
  ...args: TArgs
): number {
  return setInterval(() => {
    // node's `setInterval` sets `this` to the `Timeout` instance it returned,
    // but web `setInterval` always sets `this` to `window`
    // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#the_this_problem
    return callback.apply(globalObject, args)
  }, ms)[Symbol.toPrimitive]()
}

function webSetTimeoutPolyfill<TArgs extends any[]>(
  globalObject: GlobalObject,
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
      clearTimeout(timeout)
    }
  }
  const timeout = setTimeout(wrappedCallback, ms)
  return timeout[Symbol.toPrimitive]()
}

export const intervalsManager = new IntervalsManager()
export const timeoutsManager = new TimeoutsManager()
