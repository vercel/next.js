import { format, inspect } from '../../../compiled/next-test-primitives/browser'

export { inspect }
export function formatWithOptions(
  options: Parameters<typeof format>[1],
  ...values: unknown[]
) {
  return format(values, options)
}

/** Suite declaration callbacks have a synchronous lexical owner. */
export function createDeclarationStorage<T>() {
  let current: T | undefined
  return {
    getStore() {
      return current
    },
    run<R>(value: T, callback: () => R): R {
      const previous = current
      current = value
      try {
        const result = callback()
        if (
          result &&
          typeof (result as unknown as PromiseLike<unknown>).then === 'function'
        )
          throw new Error(
            'Browser Mode currently requires synchronous suite declarations.'
          )
        return result
      } finally {
        current = previous
      }
    },
  }
}
