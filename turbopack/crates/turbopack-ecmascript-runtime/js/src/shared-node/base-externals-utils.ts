/// <reference path="../shared/runtime/runtime-utils.ts" />

/// A 'base' utilities to support runtime can have externals.
/// Currently this is for node.js / edge runtime both.
/// If a fn requires node.js specific behavior, it should be placed in `node-external-utils` instead.

async function externalImport(id: DependencySpecifier) {
  let raw
  try {
    raw = await import(id)
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`)
  }

  if (raw && raw.__esModule && raw.default && 'default' in raw.default) {
    return interopEsm(raw.default, createNS(raw), true)
  }

  return raw
}
contextPrototype.y = externalImport

function externalRequire(
  id: ModuleId,
  thunk: () => any,
  esm: boolean = false
): Exports | EsmNamespaceObject {
  let raw
  try {
    raw = thunk()
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`)
  }

  if (!esm || raw.__esModule) {
    return raw
  }

  return interopEsm(raw, createNS(raw), true)
}

externalRequire.resolve = (
  id: string,
  options?: {
    paths?: string[]
  }
) => {
  return require.resolve(id, options)
}
contextPrototype.x = externalRequire

// Override the shared asyncLoader with an async version for Node.js/Edge.
// Chunk loading is synchronous in these runtimes, so loaders may return plain
// values or throw. The async keyword ensures dynamic import() always returns
// a Promise per spec without an extra microtask in the browser path.
async function asyncLoader(
  this: TurbopackBaseContext<Module>,
  moduleId: ModuleId
): Promise<Exports> {
  const loader = this.r(moduleId) as (
    importFunction: EsmImport
  ) => Exports | Promise<Exports>
  return loader(esmImport.bind(this))
}
contextPrototype.A = asyncLoader
