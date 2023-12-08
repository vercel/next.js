export function interopDefault<T = any>(mod: unknown): T | undefined {
  // If the module is falsy (like `null`), just return undefined.
  if (!mod) return undefined

  // If the module has a default export (named 'default'), return that.
  if (
    (typeof mod === 'object' || typeof mod === 'function') &&
    'default' in mod &&
    mod.default
  ) {
    return mod.default as T
  }

  return mod as T
}
