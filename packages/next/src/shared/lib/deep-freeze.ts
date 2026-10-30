import type { DeepReadonly, DeepReadonlyPlainValues } from './deep-readonly'
import { isPlainObject } from './is-plain-object'

/**
 * Recursively freezes an object and all of its properties. This prevents the
 * object from being modified at runtime. When the JS runtime is running in
 * strict mode, any attempts to modify a frozen object will throw an error.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
 * @param obj The object to freeze.
 */
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T> {
  return freezeRecursively(obj, freezeAnyObject) as DeepReadonly<T>
}

/**
 * Like `deepFreeze`, but only freezes plain objects and arrays. Other objects,
 * such as `RegExp`, `URL` or user class instances, are left as they are,
 * together with everything they reference, because freezing them can break
 * them: a global `RegExp` writes `lastIndex` on every `test()` and `exec()`.
 *
 * Use this for values that can contain user-provided objects, such as the
 * loaded next.config. JSON data, like manifests, can use `deepFreeze`.
 *
 * @param obj The object to freeze.
 */
export function deepFreezePlainValues<T extends object>(
  obj: T
): DeepReadonlyPlainValues<T> {
  return freezeRecursively(
    obj,
    isPlainObjectOrArray
  ) as DeepReadonlyPlainValues<T>
}

function freezeAnyObject(): boolean {
  return true
}

function isPlainObjectOrArray(obj: object): boolean {
  return Array.isArray(obj) || isPlainObject(obj)
}

/**
 * Freezes `obj` and everything it references, skipping any object for which
 * `shouldFreeze` returns false, together with everything it references.
 */
function freezeRecursively(
  obj: object,
  shouldFreeze: (obj: object) => boolean
): object {
  // If the object is already frozen, there's no need to freeze it again.
  if (Object.isFrozen(obj) || !shouldFreeze(obj)) return obj

  // For arrays, freeze each element; for other objects, each property value.
  for (const value of Array.isArray(obj) ? obj : Object.values(obj)) {
    if (!value || typeof value !== 'object') continue
    freezeRecursively(value, shouldFreeze)
  }

  return Object.freeze(obj)
}
