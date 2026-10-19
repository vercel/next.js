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
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T>
export function deepFreeze(obj: object): object {
  return freezeRecursively(obj, freezeAnyObject)
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
): DeepReadonlyPlainValues<T>
export function deepFreezePlainValues(obj: object): object {
  return freezeRecursively(obj, isPlainObject)
}

function freezeAnyObject(): boolean {
  return true
}

/**
 * Freezes `obj` and everything it references. Arrays are always frozen; other
 * objects are frozen only when `shouldFreeze` returns true, otherwise they and
 * everything they reference are left as they are.
 */
function freezeRecursively(
  obj: object,
  shouldFreeze: (obj: object) => boolean
): object {
  // If the object is already frozen, there's no need to freeze it again.
  if (Object.isFrozen(obj)) return obj

  // An array is an object, but we also want to freeze each element in the array
  // as well.
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (!item || typeof item !== 'object') continue
      freezeRecursively(item, shouldFreeze)
    }

    return Object.freeze(obj)
  }

  if (!shouldFreeze(obj)) return obj

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object') continue
    freezeRecursively(value, shouldFreeze)
  }

  return Object.freeze(obj)
}
