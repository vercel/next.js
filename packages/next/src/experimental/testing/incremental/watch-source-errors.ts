const fields = ['code', 'errno', 'syscall', 'path', 'dest'] as const

type ErrorField = (typeof fields)[number]
export type WatchSourceErrorSnapshot =
  | { kind: 'value'; value: unknown }
  | {
      kind: 'error'
      id: string
      name: string
      message: string
      stack?: string
      fields: {
        key: ErrorField
        value: unknown
        enumerable: boolean
        configurable: boolean
        writable: boolean
      }[]
      cause?: WatchSourceErrorSnapshot
      errors?: WatchSourceErrorSnapshot[]
    }

/** Value identity is separate from the number of failure occurrences. */
export function createWatchSourceErrorEncoder(domain = 'engine') {
  const identities = new WeakMap<object, string>()
  let nextId = 0
  return (error: unknown): WatchSourceErrorSnapshot => {
    const seen = new Map<Error, WatchSourceErrorSnapshot>()
    function capture(value: unknown): WatchSourceErrorSnapshot {
      if (!(value instanceof Error)) return { kind: 'value', value }
      const prior = seen.get(value)
      if (prior) return prior
      let id = identities.get(value)
      if (id === undefined)
        identities.set(value, (id = domain + ':' + ++nextId))
      const result: Extract<WatchSourceErrorSnapshot, { kind: 'error' }> = {
        kind: 'error',
        id,
        name: value.name,
        message: value.message,
        ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
        fields: [],
      }
      seen.set(value, result)
      for (const key of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor)
          result.fields.push({
            key,
            value: Reflect.get(value, key),
            enumerable: !!descriptor.enumerable,
            configurable: !!descriptor.configurable,
            writable: !!descriptor.writable,
          })
      }
      if (Object.hasOwn(value, 'cause')) result.cause = capture(value.cause)
      if (value instanceof AggregateError)
        result.errors = Array.from(value.errors, capture)
      return result
    }
    return capture(error)
  }
}

export function createWatchSourceErrorDecoder() {
  const values = new Map<string, Error>()
  return (snapshot: WatchSourceErrorSnapshot): unknown => {
    const visiting = new Set<string>()
    function restore(value: WatchSourceErrorSnapshot): unknown {
      if (value.kind === 'value') return value.value
      if (
        typeof value.id !== 'string' ||
        !value.id ||
        typeof value.name !== 'string' ||
        typeof value.message !== 'string' ||
        !Array.isArray(value.fields)
      )
        throw new Error('Invalid input source error.')
      let error = values.get(value.id)
      if (!error) {
        const constructors = {
          Error,
          TypeError,
          RangeError,
          SyntaxError,
          ReferenceError,
          URIError,
          EvalError,
        }
        const Constructor = Object.hasOwn(constructors, value.name)
          ? constructors[value.name as keyof typeof constructors]
          : Error
        error =
          value.name === 'AggregateError'
            ? new AggregateError([], value.message)
            : new Constructor(value.message)
        values.set(value.id, error)
      }
      if (visiting.has(value.id)) return error
      visiting.add(value.id)
      if (error.name !== value.name)
        Object.defineProperty(error, 'name', {
          value: value.name,
          configurable: true,
          writable: true,
        })
      Object.defineProperty(error, 'message', {
        value: value.message,
        configurable: true,
        writable: true,
      })
      if (value.stack !== undefined)
        Object.defineProperty(error, 'stack', {
          value: value.stack,
          configurable: true,
          writable: true,
        })
      for (const field of value.fields) {
        if (!fields.includes(field.key))
          throw new Error('Invalid input source error field.')
        Object.defineProperty(error, field.key, {
          value: field.value,
          enumerable: field.enumerable,
          configurable: field.configurable,
          writable: field.writable,
        })
      }
      if (value.cause !== undefined)
        Object.defineProperty(error, 'cause', {
          value: restore(value.cause),
          configurable: true,
          writable: true,
        })
      if (value.errors !== undefined)
        Object.defineProperty(error, 'errors', {
          value: value.errors.map(restore),
          configurable: true,
          writable: true,
        })
      visiting.delete(value.id)
      return error
    }
    return restore(snapshot)
  }
}
