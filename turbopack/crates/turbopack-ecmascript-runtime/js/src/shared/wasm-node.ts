/**
 * Node.js WebAssembly loading module.
 * Only included when a .wasm file is actually imported.
 */

'use turbopack no side effects'

function readWebAssemblyAsResponse(path: string) {
  const { createReadStream } = require('fs') as typeof import('fs')
  const { Readable } = require('stream') as typeof import('stream')

  const stream = createReadStream(path)

  // @ts-ignore unfortunately there's a slight type mismatch with the stream.
  return new Response(Readable.toWeb(stream), {
    headers: {
      'content-type': 'application/wasm',
    },
  })
}

export async function instantiateWebAssembly(
  chunkPath: string,
  _edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
): Promise<Record<string, unknown>> {
  const resolved = __turbopack_resolve_chunk_path__(chunkPath)
  const response = readWebAssemblyAsResponse(resolved)

  const { instance } = await WebAssembly.instantiateStreaming(response, imports)

  return instance.exports
}

export async function compileWebAssembly(
  chunkPath: string,
  _edgeModule: () => WebAssembly.Module
): Promise<WebAssembly.Module> {
  const resolved = __turbopack_resolve_chunk_path__(chunkPath)
  const response = readWebAssemblyAsResponse(resolved)

  return await WebAssembly.compileStreaming(response)
}
