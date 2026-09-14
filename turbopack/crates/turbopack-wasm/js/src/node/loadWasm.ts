// Bundled WebAssembly helper for Node.js runtimes. Loaded on demand by the
// generated wasm loader instead of living in the default runtime.
//
// The wasm file is read from disk relative to the shared `__turbopack_runtime_root__`
// runtime primitive. `fs`/`stream`/`path` are required lazily so they're only
// pulled in when wasm is actually used.
declare const __turbopack_runtime_root__: string

function readWebAssemblyAsResponse(filePath: string): Response {
  const { createReadStream } = require('fs') as typeof import('fs')
  const { Readable } = require('stream') as typeof import('stream')

  const stream = createReadStream(resolvePath(filePath))

  // @ts-ignore unfortunately there's a slight type mismatch with the stream.
  return new Response(Readable.toWeb(stream), {
    headers: {
      'content-type': 'application/wasm',
    },
  })
}

function resolvePath(chunkPath: string): string {
  const { resolve } = require('path') as typeof import('path')
  return resolve(__turbopack_runtime_root__, chunkPath)
}

export async function instantiate(
  chunkPath: string,
  imports: WebAssembly.Imports
): Promise<WebAssembly.Exports> {
  const response = readWebAssemblyAsResponse(chunkPath)
  const { instance } = await WebAssembly.instantiateStreaming(response, imports)
  return instance.exports
}

export async function compileModule(
  chunkPath: string
): Promise<WebAssembly.Module> {
  const response = readWebAssemblyAsResponse(chunkPath)
  return await WebAssembly.compileStreaming(response)
}
