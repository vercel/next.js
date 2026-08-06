type RequestInitRead =
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; reason: unknown }

export type RequestInsightsFetchInitSnapshot = {
  init: RequestInit
  readHeaders(): Headers
  readString(property: 'credentials' | 'method'): string | undefined
}

/**
 * Shares lazy RequestInit dictionary reads between Request Insights and fetch.
 * This preserves inherited properties and replays getters (including errors)
 * without invoking application code more than once.
 */
export function createRequestInsightsFetchInitSnapshot(
  init: RequestInit
): RequestInsightsFetchInitSnapshot {
  const reads = new Map<PropertyKey, RequestInitRead>()
  const source = (init as RequestInit | null) ?? {}
  const target = Object.create(null) as RequestInit

  function read(property: PropertyKey): unknown {
    const cached = reads.get(property)
    if (cached?.status === 'rejected') {
      throw cached.reason
    }
    if (cached?.status === 'fulfilled') {
      return cached.value
    }

    try {
      const value = Reflect.get(source, property, source)
      reads.set(property, { status: 'fulfilled', value })
      return value
    } catch (reason) {
      reads.set(property, { status: 'rejected', reason })
      throw reason
    }
  }

  function write(property: PropertyKey, value: unknown): void {
    reads.set(property, { status: 'fulfilled', value })
    Reflect.defineProperty(target, property, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  const snapshot = new Proxy(target, {
    get(_target, property) {
      return read(property)
    },
    getOwnPropertyDescriptor(snapshotTarget, property) {
      const override = Reflect.getOwnPropertyDescriptor(
        snapshotTarget,
        property
      )
      if (override) return override

      const descriptor = Reflect.getOwnPropertyDescriptor(source, property)
      return descriptor ? { ...descriptor, configurable: true } : undefined
    },
    ownKeys(snapshotTarget) {
      return Array.from(
        new Set([
          ...Reflect.ownKeys(source),
          ...Reflect.ownKeys(snapshotTarget),
        ])
      )
    },
    set(_snapshotTarget, property, value) {
      write(property, value)
      return true
    },
  })

  return {
    init: snapshot,
    readHeaders() {
      try {
        const headers = new Headers(read('headers') as HeadersInit | undefined)
        write('headers', headers)
        return headers
      } catch (reason) {
        reads.set('headers', { status: 'rejected', reason })
        throw reason
      }
    },
    readString(property) {
      try {
        const value = read(property)
        if (value === undefined) return undefined
        const normalized = `${value}`
        write(property, normalized)
        return normalized
      } catch (reason) {
        reads.set(property, { status: 'rejected', reason })
        throw reason
      }
    },
  }
}
