'use turbopack: no side effects'

/**
 * `require.cache` compatibility shim.
 *
 * The runtime stores instantiated modules in a `Map` (see `ModuleCache` in
 * `runtime-types.d.ts`), but `require.cache` is specified as a object, so we
 *  use a Proxy to paper over the deltas
 */

// Access the module cache through the magic context param
// Technically it is also available as a global, but it would be difficult to name.
declare const __turbopack_context__: { c: Map<ModuleId, unknown>; m: Module }
const moduleCache = __turbopack_context__.c

/**
 * Property keys always reach a `Proxy` trap as strings, but `ModuleId` is
 * `string | number` and the id kind is fixed for a build: either every id is a
 * number or every id is a string. Detect this by testing our own id.
 */
const idsAreNumeric = typeof __turbopack_context__.m.id === 'number'

// Coerce a string object propty to a ModuleId so it can match the cache.
function toKey(key: string): ModuleId {
  if (!idsAreNumeric) return key
  // A non-canonical spelling (`"0123"`, `"1e3"`, `" 1"`) is not any module's
  // id, so leave it as a string: it will simply miss, as it would have against
  // the object cache.  Without this "1x" would coerce to 1 which might match a module, incorrectly
  const numeric = Number(key)
  return String(numeric) === key ? numeric : key
}

export const cache: Record<string, unknown> = new Proxy(
  // Use an empty object as the 'target' so we can implement ownKeys
  {} as Record<string, unknown>,
  {
    get(_target, key) {
      if (typeof key !== 'string') return undefined
      return moduleCache.get(toKey(key))
    },
    set(_target, key, value) {
      if (typeof key !== 'string') return false
      moduleCache.set(toKey(key), value)
      return true
    },
    has(_target, key) {
      return typeof key === 'string' && moduleCache.has(toKey(key))
    },
    deleteProperty(_target, key) {
      if (typeof key !== 'string') return false
      moduleCache.delete(toKey(key))
      return true
    },
    ownKeys() {
      return Array.from(moduleCache.keys(), String)
    },
    // `ownKeys` alone is not enough: `Object.keys()` filters by enumerability, so
    // it invokes this trap for every key returned above.
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string') return undefined
      const id = toKey(key)
      if (!moduleCache.has(id)) return undefined
      return {
        value: moduleCache.get(id),
        writable: true,
        enumerable: true,
        configurable: true,
      }
    },
  }
)
