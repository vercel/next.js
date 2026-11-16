/**
 * Deep-copies plain objects and arrays so the copy can be modified without
 * affecting the original. Functions and class instances are kept by reference,
 * a `RegExp` is recreated, and getters and setters are copied as they are.
 * Unlike `structuredClone`, it does not throw on functions or class instances,
 * which config values can contain.
 */
export function cloneObject<T>(obj: T): T {
  // The copy has the same shape as `obj`, which TypeScript cannot verify.
  return cloneValue(obj) as T
}

function cloneValue(obj: any): any {
  // Primitives & null
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // RegExp → clone via constructor
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags)
  }

  // Function → just reuse the function reference
  if (typeof obj === 'function') {
    return obj
  }

  // Arrays → map each element
  if (Array.isArray(obj)) {
    return obj.map(cloneValue)
  }

  // Detect non‑plain objects (class instances)
  const proto = Object.getPrototypeOf(obj)
  const isPlainObject = proto === Object.prototype || proto === null

  // If it's not a plain object, just return the original
  if (!isPlainObject) {
    return obj
  }

  // Plain object → create a new object with the same prototype
  // and copy all properties, cloning data properties and keeping
  // accessor properties (getters/setters) as‑is.
  const result = Object.create(proto)
  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key)

    if (descriptor && (descriptor.get || descriptor.set)) {
      // Accessor property → copy descriptor as‑is (get/set functions)
      Object.defineProperty(result, key, descriptor)
    } else {
      // Data property → clone the value
      result[key] = cloneValue(obj[key])
    }
  }

  return result
}
