/**
 * Edge runtime WebAssembly loading module.
 * Only included when a .wasm file is actually imported.
 */

 

'use turbopack no side effects'

async function loadEdgeWasm(
  chunkPath: string,
  edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
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

export async function instantiateWebAssembly(
  chunkPath: string,
  edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
): Promise<Record<string, unknown>> {
  const module = await loadEdgeWasm(chunkPath, edgeModule)
  const instance = await WebAssembly.instantiate(module, imports)

  return instance.exports
}

export async function compileWebAssembly(
  chunkPath: string,
  edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
  return loadEdgeWasm(chunkPath, edgeModule)
}
