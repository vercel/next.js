// Public utility objects use live, named getters without exposing the module
// loader's namespace prototype or CommonJS interop metadata.
export function createExportObject(source) {
  const exports = {}
  for (const name of Object.keys(source).sort()) {
    const getter = { [name]: () => source[name] }[name]
    Object.defineProperty(exports, name, { get: getter, enumerable: true })
  }
  return exports
}
