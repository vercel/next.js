import type { EdgeFunctionResult } from './types'
import type { RequestData, ResponseData } from './types'
import { TransformStream, ReadableStream } from 'web-streams-polyfill/ponyfill'
import { readFileSync } from 'fs'
import vm from 'vm'

function atob(b64Encoded: string) {
  return Buffer.from(b64Encoded, 'base64').toString('binary')
}

function btoa(str: string) {
  return Buffer.from(str, 'binary').toString('base64')
}

function log(...args: any[]) {
  console.log(...args)
}

function logError(...args: any[]) {
  console.error(...args)
}

class TextEncoderRuntime {
  encoder: TextEncoder

  constructor() {
    this.encoder = new TextEncoder()
  }

  get encoding() {
    return this.encoder.encoding
  }

  public encode(input: string) {
    return this.encoder.encode(input)
  }
}

class TextDecoderRuntime {
  decoder: TextDecoder

  constructor() {
    this.decoder = new TextDecoder()
  }

  get encoding() {
    return this.decoder.encoding
  }

  get fatal() {
    return this.decoder.fatal
  }

  get ignoreBOM() {
    return this.decoder.ignoreBOM
  }

  public decode(input: BufferSource, options?: TextDecodeOptions) {
    return this.decoder.decode(input, options)
  }
}

let cache:
  | {
      context: { [key: string]: any }
      paths: Set<string>
      sandbox: vm.Context
    }
  | undefined

export function clearSandboxCache(path: string) {
  // clear cache when path is used by cached sandbox
  if (cache === undefined) return
  if (!cache.paths.has(path)) return
  cache = undefined
}

export async function run(params: {
  name: string
  paths: string[]
  request: RequestData
  response: ResponseData
}): Promise<EdgeFunctionResult> {
  if (cache === undefined) {
    const context: { [key: string]: any } = {
      _NEXT_ENTRIES: {},
      atob,
      btoa,
      clearInterval,
      clearTimeout,
      console: { log, error: logError },
      fetch,
      Headers,
      process: { env: { ...process.env } },
      ReadableStream,
      setInterval,
      setTimeout,
      TextDecoder: TextDecoderRuntime,
      TextEncoder: TextEncoderRuntime,
      TransformStream,
      URL,
      URLSearchParams,
    }

    cache = {
      context,
      sandbox: vm.createContext({
        ...context,
        self: context,
      }),
      paths: new Set<string>(),
    }
  }

  for (const path of params.paths) {
    if (!cache.paths.has(path)) {
      vm.runInNewContext(readFileSync(path, 'utf-8'), cache.sandbox, {
        filename: path,
      })
      cache.paths.add(path)
    }
  }

  const fn = cache.context._NEXT_ENTRIES[`edge_${params.name}`].default
  return fn({ request: params.request, response: params.response })
}
