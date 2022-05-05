import type { Context } from 'vm'
import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { readFileSync, promises as fs } from 'fs'
import { requireDependencies } from './require'
import '../../node-polyfill-web-streams'
import cookie from 'next/dist/compiled/cookie'
import * as polyfills from './polyfills'
import {
  AbortController,
  AbortSignal,
} from 'next/dist/compiled/abort-controller'
import vm from 'vm'
import type { WasmBinding } from '../../../build/webpack/loaders/get-module-build-info'

const WEBPACK_HASH_REGEX =
  /__webpack_require__\.h = function\(\) \{ return "[0-9a-f]+"; \}/g

/**
 * For a given path a context, this function checks if there is any module
 * context that contains the path with an older content and, if that's the
 * case, removes the context from the cache.
 */
export function clearModuleContext(path: string, content: Buffer | string) {
  for (const [key, cache] of caches) {
    const prev = cache?.paths.get(path)?.replace(WEBPACK_HASH_REGEX, '')
    if (
      typeof prev !== 'undefined' &&
      prev !== content.toString().replace(WEBPACK_HASH_REGEX, '')
    ) {
      caches.delete(key)
    }
  }
}

/**
 * A Map of cached module contexts indexed by the module name. It allows
 * to have a different cache scoped per module name or depending on the
 * provided module key on creation.
 */
const caches = new Map<
  string,
  {
    context: Context
    paths: Map<string, string>
    require: Map<string, any>
    warnedEvals: Set<string>
  }
>()

/**
 * For a given module name this function will create a context for the
 * runtime. It returns a function where we can provide a module path and
 * run in within the context. It may or may not use a cache depending on
 * the parameters.
 */
export async function getModuleContext(options: {
  module: string
  onWarning: (warn: Error) => void
  useCache: boolean
  env: string[]
  wasm: WasmBinding[]
}) {
  let moduleCache = options.useCache
    ? caches.get(options.module)
    : await createModuleContext(options)

  if (!moduleCache) {
    moduleCache = await createModuleContext(options)
    caches.set(options.module, moduleCache)
  }

  return {
    context: moduleCache.context,
    runInContext: (paramPath: string) => {
      if (!moduleCache!.paths.has(paramPath)) {
        const content = readFileSync(paramPath, 'utf-8')
        try {
          vm.runInNewContext(content, moduleCache!.context, {
            filename: paramPath,
          })
          moduleCache!.paths.set(paramPath, content)
        } catch (error) {
          if (options.useCache) {
            caches.delete(options.module)
          }
          throw error
        }
      }
    },
  }
}

/**
 * Create a module cache specific for the provided parameters. It includes
 * a context, require cache and paths cache and loads three types:
 * 1. Dependencies that hold no runtime dependencies.
 * 2. Dependencies that require runtime globals such as Blob.
 * 3. Dependencies that are scoped for the provided parameters.
 */
async function createModuleContext(options: {
  onWarning: (warn: Error) => void
  module: string
  env: string[]
  wasm: WasmBinding[]
}) {
  const requireCache = new Map([
    [require.resolve('next/dist/compiled/cookie'), { exports: cookie }],
  ])

  const context = createContext(options)

  requireDependencies({
    requireCache: requireCache,
    context: context,
    dependencies: [
      {
        path: require.resolve('../spec-compliant/headers'),
        mapExports: { Headers: 'Headers' },
      },
      {
        path: require.resolve('../spec-compliant/response'),
        mapExports: { Response: 'Response' },
      },
      {
        path: require.resolve('../spec-compliant/request'),
        mapExports: { Request: 'Request' },
      },
    ],
  })

  const moduleCache = {
    context: context,
    paths: new Map<string, string>(),
    require: requireCache,
    warnedEvals: new Set<string>(),
  }

  context.__next_eval__ = function __next_eval__(fn: Function) {
    const key = fn.toString()
    if (!moduleCache.warnedEvals.has(key)) {
      const warning = new Error(
        `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware`
      )
      warning.name = 'DynamicCodeEvaluationWarning'
      Error.captureStackTrace(warning, __next_eval__)
      moduleCache.warnedEvals.add(key)
      options.onWarning(warning)
    }
    return fn()
  }

  context.fetch = (input: RequestInfo, init: RequestInit = {}) => {
    init.headers = new Headers(init.headers ?? {})
    const prevs = init.headers.get(`x-middleware-subrequest`)?.split(':') || []
    const value = prevs.concat(options.module).join(':')
    init.headers.set('x-middleware-subrequest', value)

    if (!init.headers.has('user-agent')) {
      init.headers.set(`user-agent`, `Next.js Middleware`)
    }

    if (typeof input === 'object' && 'url' in input) {
      return fetch(input.url, {
        ...init,
        headers: {
          ...Object.fromEntries(input.headers),
          ...Object.fromEntries(init.headers),
        },
      })
    }

    return fetch(String(input), init)
  }

  Object.assign(context, await loadWasm(options.wasm))

  return moduleCache
}

/**
 * Create a base context with all required globals for the runtime that
 * won't depend on any externally provided dependency.
 */
function createContext(options: {
  /** Environment variables to be provided to the context */
  env: string[]
}) {
  const context: { [key: string]: unknown } = {
    _ENTRIES: {},
    atob: polyfills.atob,
    Blob,
    btoa: polyfills.btoa,
    clearInterval,
    clearTimeout,
    console: {
      assert: console.assert.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      log: console.log.bind(console),
      time: console.time.bind(console),
      timeEnd: console.timeEnd.bind(console),
      timeLog: console.timeLog.bind(console),
      warn: console.warn.bind(console),
    },
    AbortController,
    AbortSignal,
    CryptoKey: polyfills.CryptoKey,
    Crypto: polyfills.Crypto,
    crypto: new polyfills.Crypto(),
    File,
    FormData,
    process: {
      env: buildEnvironmentVariablesFrom(options.env),
    },
    ReadableStream,
    setInterval,
    setTimeout,
    TextDecoder,
    TextEncoder,
    TransformStream,
    URL,
    URLSearchParams,

    // Indexed collections
    Array,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,

    // Keyed collections
    Map,
    Set,
    WeakMap,
    WeakSet,

    // Structured data
    ArrayBuffer,
    SharedArrayBuffer,
  }

  // Self references
  context.self = context
  context.globalThis = context

  return vm.createContext(context, {
    codeGeneration:
      process.env.NODE_ENV === 'production'
        ? {
            strings: false,
            wasm: false,
          }
        : undefined,
  })
}

function buildEnvironmentVariablesFrom(
  keys: string[]
): Record<string, string | undefined> {
  const pairs = keys.map((key) => [key, process.env[key]])
  const env = Object.fromEntries(pairs)
  env.NEXT_RUNTIME = 'edge'
  return env
}

async function loadWasm(
  wasm: WasmBinding[]
): Promise<Record<string, WebAssembly.Module>> {
  const modules: Record<string, WebAssembly.Module> = {}

  await Promise.all(
    wasm.map(async (binding) => {
      const module = await WebAssembly.compile(
        await fs.readFile(binding.filePath)
      )
      modules[binding.name] = module
    })
  )

  return modules
}
