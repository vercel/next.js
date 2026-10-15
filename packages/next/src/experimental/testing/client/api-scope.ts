import { assertBrowserApiScope } from './async-context'

// Shared primitive assertion proxies own retained matcher access checks. Keep
// their existing inline-snapshot wrapper depth and exact source callsite.
export function guardedExpect<T extends Function>(fn: T): T {
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      assertBrowserApiScope('assertion')
      return Reflect.apply(target, thisArg, args)
    },
    get(target, key, receiver) {
      const selected = Reflect.get(target, key, receiver)
      if (typeof selected !== 'function') return selected
      return (...args: unknown[]) => {
        assertBrowserApiScope('assertion')
        if (key === 'poll')
          throw new Error(
            'Browser Mode asynchronous polling remains unsupported.'
          )
        return Reflect.apply(selected, target, args)
      }
    },
  })
}

export function guardedDeclaration<T extends Function>(fn: T): T {
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      assertBrowserApiScope('declaration')
      return Reflect.apply(target, thisArg, args)
    },
    get(target, key, receiver) {
      assertBrowserApiScope('declaration')
      const selected = Reflect.get(target, key, receiver)
      return typeof selected === 'function'
        ? guardedDeclaration(selected)
        : selected
    },
  })
}
