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
        return Reflect.apply(selected, target, args)
      }
    },
  })
}

export function guardedDeclaration<T extends Function>(
  fn: T,
  preserveIntrinsicFn = false
): T {
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      assertBrowserApiScope('declaration')
      return Reflect.apply(target, thisArg, args)
    },
    get(target, key, receiver) {
      assertBrowserApiScope('declaration')
      const selected = Reflect.get(target, key, receiver)
      if (key === 'fn' && preserveIntrinsicFn) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
        if (
          descriptor &&
          'value' in descriptor &&
          descriptor.value === selected &&
          descriptor.configurable === false &&
          descriptor.writable === false
        )
          // These exact intrinsic callables check the active collector on use.
          // Their frozen property must preserve the native Proxy get invariant.
          return selected
      }
      return typeof selected === 'function'
        ? guardedDeclaration(selected)
        : selected
    },
  })
}
