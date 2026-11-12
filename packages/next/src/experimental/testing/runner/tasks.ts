import { processTaskError } from '../primitives/error'

import type { TestError } from '../primitives'

const applyTaskErrorAccessor = Reflect.apply

const readTaskErrorProperty = Reflect.get

const writeTaskErrorProperty = Reflect.set

const TaskErrorProxy = Proxy

/** The pinned serializer mutates diff values/causes; task views must not alter raw failures. */
export function serializeTaskError(error: unknown): TestError {
  const seen = new Map<object, object>()
  function errorScalarFlag(key: PropertyKey) {
    return key === 'name' ? 1 : key === 'message' ? 2 : key === 'stack' ? 4 : 0
  }
  function inheritedDescriptor(target: object, key: PropertyKey) {
    for (
      let value = Object.getPrototypeOf(target);
      value;
      value = Object.getPrototypeOf(value)
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor) return descriptor
    }
  }
  function copy(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const previous = seen.get(value)
    if (previous) return previous
    const copyTarget: object = Array.isArray(value)
      ? []
      : Object.create(Object.getPrototypeOf(value))
    let inheritedWrites = 0
    const cloned = new TaskErrorProxy(copyTarget, {
      get(target, key, receiver) {
        if (Object.getOwnPropertyDescriptor(target, key))
          return readTaskErrorProperty(target, key, receiver)
        const descriptor = inheritedDescriptor(target, key)
        if (descriptor && !('value' in descriptor) && errorScalarFlag(key)) {
          if (!descriptor.get) return undefined
          // An actual serializer write retains its existing clone-local
          // computation. Untouched getters still need the failure's receiver.
          return (inheritedWrites & errorScalarFlag(key)) !== 0
            ? applyTaskErrorAccessor(descriptor.get, cloned, [])
            : readTaskErrorProperty(value, key, value)
        }
        return readTaskErrorProperty(target, key, receiver)
      },
      set(target, key, next, receiver) {
        if (Object.getOwnPropertyDescriptor(target, key))
          return writeTaskErrorProperty(target, key, next, receiver)
        const descriptor = inheritedDescriptor(target, key)
        if (descriptor && !('value' in descriptor) && errorScalarFlag(key)) {
          if (!descriptor.set) return false
          inheritedWrites |= errorScalarFlag(key)
          applyTaskErrorAccessor(descriptor.set, cloned, [next])
          return true
        }
        return writeTaskErrorProperty(target, key, next, receiver)
      },
    })
    // Recursive causes and direct self references must see this final identity.
    seen.set(value, cloned)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in descriptor) && errorScalarFlag(key)) {
        const getter = descriptor.get
        let assigned = false
        let assignedValue: unknown
        Object.defineProperty(cloned, key, {
          ...descriptor,
          configurable: true,
          get: getter
            ? () => {
                if (key !== 'stack' && assigned)
                  return applyTaskErrorAccessor(getter, cloned, [])
                // Read the current property: an earlier authored getter may
                // have replaced its descriptor during this serialization.
                const original = readTaskErrorProperty(value, key, value)
                return assigned ? assignedValue : original
              }
            : undefined,
          set: descriptor.set
            ? (next: unknown) => {
                assigned = true
                assignedValue = next
                // Native stack writes remain local without calling its setter.
                // Other setters retain their prior clone-local side effects.
                if (key !== 'stack')
                  applyTaskErrorAccessor(descriptor.set!, cloned, [next])
              }
            : undefined,
        })
        continue
      }
      Object.defineProperty(cloned, key, {
        ...descriptor,
        ...(key === 'length' && Array.isArray(value)
          ? {}
          : { configurable: true }),
        ...('value' in descriptor
          ? {
              writable: true,
              ...(seen.has(descriptor.value)
                ? { value: seen.get(descriptor.value) }
                : {}),
            }
          : {}),
      })
    }
    if ('cause' in value && value.cause && typeof value.cause === 'object')
      Object.defineProperty(cloned, 'cause', {
        configurable: true,
        writable: true,
        enumerable: Object.prototype.propertyIsEnumerable.call(value, 'cause'),
        value: copy(value.cause),
      })
    return cloned
  }
  const copied = copy(error)
  return processTaskError(copied, seen)
}
