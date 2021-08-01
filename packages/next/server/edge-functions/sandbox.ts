import type { EdgeFunctionResult } from './types'
import type { RequestData, ResponseData } from './types'
import { TransformStream, ReadableStream } from 'web-streams-polyfill/ponyfill'
import { readFileSync } from 'fs'
import { dirname } from 'path'
import vm from 'vm'

export async function run(params: {
  path: string
  request: RequestData
  response: ResponseData
}): Promise<EdgeFunctionResult> {
  const cache = new Map()
  const _require: any = (referrer: string, specifier: string) => {
    const resolved = require.resolve(specifier, { paths: [dirname(referrer)] })
    const cached = cache.get(resolved)
    if (cached !== undefined) {
      return cached.exports
    }

    const module = {
      exports: {},
      loaded: false,
      id: resolved,
    }

    cache.set(resolved, module)
    const fn = vm.runInContext(
      `(function(module,exports,require,__dirname,__filename) {${readFileSync(
        resolved,
        'utf-8'
      )}\n})`,
      sandbox
    )

    try {
      fn(
        module,
        module.exports,
        process.env.NODE_ENV === 'development'
          ? (item: string) => {
              const error = new Error(
                `Node.js APIs are not allowed for Edge Middleware (attempted to require "${item}")`
              )
              error.stack = ''
              throw error
            }
          : _require.bind(null, resolved),
        dirname(resolved),
        resolved
      )
    } finally {
      cache.delete(resolved)
    }

    module.loaded = true
    return module.exports
  }

  const context = {
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

  const sandbox = vm.createContext({
    ...context,
    self: context,
  })

  const mod = _require(params.path, params.path)
  const fn = mod.default || mod
  return fn({ request: params.request, response: params.response })
}

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
