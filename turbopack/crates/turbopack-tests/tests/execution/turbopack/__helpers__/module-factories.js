// Helpers to inspect the module factories registered in `__turbopack_modules__`. They let a test
// check how a module was compiled (e.g. what was inlined, removed or merged) without reading the
// emitted chunks.
//
// Modules are identified by their path relative to the test's `input/` directory, e.g. `lib.js`
// or `node_modules/lib/index.js`.

function modulePath(id) {
  return id.split(' ')[0]
}

function isAsyncLoader(id) {
  return id.includes('loader)')
}

/**
 * The ids of all factories of the module at `file`: the module itself and its parts (e.g.
 * `<locals>` or `<exports>`). Async loaders (the stubs that load a chunk for a dynamic import) are
 * excluded.
 */
export function moduleIds(file) {
  return Array.from(__turbopack_modules__.keys()).filter(
    (id) => modulePath(id).endsWith(`/input/${file}`) && !isAsyncLoader(id)
  )
}

/**
 * Whether the module at `file` has a factory of its own, i.e. it is part of the bundle and wasn't
 * removed or merged into another module.
 */
export function hasModuleFactory(file) {
  return moduleIds(file).length > 0
}

/** The source of the single factory of the module at `file`. */
export function moduleCode(file) {
  const ids = moduleIds(file)
  if (ids.length !== 1) {
    throw new Error(
      `expected exactly one module factory for ${file}, found ${JSON.stringify(ids)}`
    )
  }
  return __turbopack_modules__.get(ids[0]).toString()
}

/** The sources of all module factories, joined. */
export function bundledCode() {
  return Array.from(__turbopack_modules__.values(), (factory) =>
    factory.toString()
  ).join('\n')
}
