// Bundled WebAssembly helper for the browser (DOM) runtime. Loaded on demand by
// the generated wasm loader instead of living in the default runtime.
//
// The wasm file is fetched relative to the chunk base path via the shared
// `__turbopack_chunk_relative_url__` runtime primitive. `edgeModule` is unused in
// the DOM runtime (the wasm is fetched, not provided as a global).
declare const __turbopack_chunk_relative_url__: (chunkPath: string) => string

export async function instantiate(
  chunkPath: string,
  imports: WebAssembly.Imports
): Promise<WebAssembly.Exports> {
  const req = fetch(__turbopack_chunk_relative_url__(chunkPath))
  const { instance } = await WebAssembly.instantiateStreaming(req, imports)
  return instance.exports
}

export async function compileModule(
  chunkPath: string
): Promise<WebAssembly.Module> {
  const req = fetch(__turbopack_chunk_relative_url__(chunkPath))
  return await WebAssembly.compileStreaming(req)
}
