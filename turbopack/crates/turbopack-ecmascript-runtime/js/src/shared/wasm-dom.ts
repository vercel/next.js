/**
 * Browser DOM WebAssembly loading module.
 * Only included when a .wasm file is actually imported.
 */

'use turbopack no side effects'

export async function instantiateWebAssembly(
  chunkPath: string,
  _edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
): Promise<Record<string, unknown>> {
  const url = __turbopack_chunk_url__(chunkPath)
  const req = fetch(url)

  const { instance } = await WebAssembly.instantiateStreaming(req, imports)

  return instance.exports
}

export async function compileWebAssembly(
  chunkPath: string,
  _edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
  const url = __turbopack_chunk_url__(chunkPath)
  const req = fetch(url)

  return await WebAssembly.compileStreaming(req)
}
