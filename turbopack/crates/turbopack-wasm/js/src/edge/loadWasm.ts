// Bundled WebAssembly helper for the edge runtime. Loaded on demand by the
// generated wasm loader instead of living in the default runtime.
//
// In edge runtimes wasm can't be fetched dynamically; it's provided ahead of
// time via the `edgeModule` thunk that the loader passes in. This helper is fully
// self-contained — it needs nothing from the runtime.
function loadEdgeWasm(
  chunkPath: string,
  edgeModule: () => WebAssembly.Module
): WebAssembly.Module {
  let module
  try {
    module = edgeModule()
  } catch (_e) {}

  if (!module) {
    throw new Error(
      `dynamically loading WebAssembly is not supported in this runtime as global was not injected for chunk '${chunkPath}'`
    )
  }

  return module
}

export async function instantiate(
  chunkPath: string,
  imports: WebAssembly.Imports,
  edgeModule: () => WebAssembly.Module
): Promise<Exports> {
  const module = loadEdgeWasm(chunkPath, edgeModule)
  // inconsistent with the `node` and `dom` runtimes
  // we return the wrong object here. we return `instance`
  // here but the other runtimes return `instance.exports`
  return await WebAssembly.instantiate(module, imports)
}

export async function compileModule(
  chunkPath: string,
  edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
  return loadEdgeWasm(chunkPath, edgeModule)
}
