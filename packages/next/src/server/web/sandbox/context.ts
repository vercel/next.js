import { AsyncLocalStorage } from 'async_hooks'
import type { AssetBinding } from '../../../build/webpack/loaders/get-module-build-info'
import {
  decorateServerError,
  getServerError,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import {
  COMPILER_NAMES,
  EDGE_UNSUPPORTED_NODE_APIS,
} from '../../../shared/lib/constants'
import { EdgeRuntime } from 'next/dist/compiled/edge-runtime'
import { readFileSync, promises as fs } from 'fs'
import { validateURL } from '../utils'
import { pick } from '../../../lib/pick'
import { fetchInlineAsset } from './fetch-inline-assets'
import type { EdgeFunctionDefinition } from '../../../build/webpack/plugins/middleware-plugin'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { runInContext } from 'vm'

const WEBPACK_HASH_REGEX =
  /__webpack_require__\.h = function\(\) \{ return "[0-9a-f]+"; \}/g

interface ModuleContext {
  runtime: EdgeRuntime
  paths: Map<string, string>
  warnedEvals: Set<string>
}

/**
 * A Map of cached module contexts indexed by the module name. It allows
 * to have a different cache scoped per module name or depending on the
 * provided module key on creation.
 */
const moduleContexts = new Map<string, ModuleContext>()

/**
 * For a given path a context, this function checks if there is any module
 * context that contains the path with an older content and, if that's the
 * case, removes the context from the cache.
 */
export function clearModuleContext(path: string, content: Buffer | string) {
  for (const [key, cache] of moduleContexts) {
    const prev = cache?.paths.get(path)?.replace(WEBPACK_HASH_REGEX, '')
    if (
      typeof prev !== 'undefined' &&
      prev !== content.toString().replace(WEBPACK_HASH_REGEX, '')
    ) {
      moduleContexts.delete(key)
    }
  }
}

async function loadWasm(
  wasm: AssetBinding[]
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

function buildEnvironmentVariablesFrom(
  keys: string[]
): Record<string, string | undefined> {
  const pairs = keys.map((key) => [key, process.env[key]])
  const env = Object.fromEntries(pairs)
  env.NEXT_RUNTIME = 'edge'
  return env
}

function throwUnsupportedAPIError(name: string) {
  const error =
    new Error(`A Node.js API is used (${name}) which is not supported in the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
  decorateServerError(error, COMPILER_NAMES.edgeServer)
  throw error
}

function createProcessPolyfill(options: Pick<ModuleContextOptions, 'env'>) {
  const env = buildEnvironmentVariablesFrom(options.env)

  const processPolyfill = { env }
  const overridenValue: Record<string, any> = {}
  for (const key of Object.keys(process)) {
    if (key === 'env') continue
    Object.defineProperty(processPolyfill, key, {
      get() {
        if (overridenValue[key]) {
          return overridenValue[key]
        }
        if (typeof (process as any)[key] === 'function') {
          return () => throwUnsupportedAPIError(`process.${key}`)
        }
        return undefined
      },
      set(value) {
        overridenValue[key] = value
      },
      enumerable: false,
    })
  }
  return processPolyfill
}

function addStub(context: EdgeRuntime['context'], name: string) {
  Object.defineProperty(context, name, {
    get() {
      return function () {
        throwUnsupportedAPIError(name)
      }
    },
    enumerable: false,
  })
}

function getDecorateUnhandledError(runtime: EdgeRuntime) {
  const EdgeRuntimeError = runtime.evaluate(`Error`)
  return (error: any) => {
    if (error instanceof EdgeRuntimeError) {
      decorateServerError(error, COMPILER_NAMES.edgeServer)
    }
  }
}

function getDecorateUnhandledRejection(runtime: EdgeRuntime) {
  const EdgeRuntimeError = runtime.evaluate(`Error`)
  return (rejected: { reason: typeof EdgeRuntimeError }) => {
    if (rejected.reason instanceof EdgeRuntimeError) {
      decorateServerError(rejected.reason, COMPILER_NAMES.edgeServer)
    }
  }
}

/**
 * Create a module cache specific for the provided parameters. It includes
 * a runtime context, require cache and paths cache.
 */
async function createModuleContext(options: ModuleContextOptions) {
  const warnedEvals = new Set<string>()
  const warnedWasmCodegens = new Set<string>()
  const wasm = await loadWasm(options.edgeFunctionEntry.wasm ?? [])
  const runtime = new EdgeRuntime({
    codeGeneration:
      process.env.NODE_ENV !== 'production'
        ? { strings: true, wasm: true }
        : undefined,
    extend: (context) => {
      context.process = createProcessPolyfill(options)

      context.__next_eval__ = function __next_eval__(fn: Function) {
        const key = fn.toString()
        if (!warnedEvals.has(key)) {
          const warning = getServerError(
            new Error(
              `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime
Learn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation`
            ),
            COMPILER_NAMES.edgeServer
          )
          warning.name = 'DynamicCodeEvaluationWarning'
          Error.captureStackTrace(warning, __next_eval__)
          warnedEvals.add(key)
          options.onWarning(warning)
        }
        return fn()
      }

      context.__next_webassembly_compile__ =
        function __next_webassembly_compile__(fn: Function) {
          const key = fn.toString()
          if (!warnedWasmCodegens.has(key)) {
            const warning = getServerError(
              new Error(`Dynamic WASM code generation (e. g. 'WebAssembly.compile') not allowed in Edge Runtime.
Learn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation`),
              COMPILER_NAMES.edgeServer
            )
            warning.name = 'DynamicWasmCodeGenerationWarning'
            Error.captureStackTrace(warning, __next_webassembly_compile__)
            warnedWasmCodegens.add(key)
            options.onWarning(warning)
          }
          return fn()
        }

      context.__next_webassembly_instantiate__ =
        async function __next_webassembly_instantiate__(fn: Function) {
          const result = await fn()

          // If a buffer is given, WebAssembly.instantiate returns an object
          // containing both a module and an instance while it returns only an
          // instance if a WASM module is given. Utilize the fact to determine
          // if the WASM code generation happens.
          //
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/instantiate#primary_overload_%E2%80%94_taking_wasm_binary_code
          const instantiatedFromBuffer = result.hasOwnProperty('module')

          const key = fn.toString()
          if (instantiatedFromBuffer && !warnedWasmCodegens.has(key)) {
            const warning = getServerError(
              new Error(`Dynamic WASM code generation ('WebAssembly.instantiate' with a buffer parameter) not allowed in Edge Runtime.
Learn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation`),
              COMPILER_NAMES.edgeServer
            )
            warning.name = 'DynamicWasmCodeGenerationWarning'
            Error.captureStackTrace(warning, __next_webassembly_instantiate__)
            warnedWasmCodegens.add(key)
            options.onWarning(warning)
          }
          return result
        }

      const __fetch = context.fetch
      context.fetch = async (input, init = {}) => {
        const callingError = new Error('[internal]')
        const assetResponse = await fetchInlineAsset({
          input,
          assets: options.edgeFunctionEntry.assets,
          distDir: options.distDir,
          context,
        })
        if (assetResponse) {
          return assetResponse
        }

        init.headers = new Headers(init.headers ?? {})
        const prevs =
          init.headers.get(`x-middleware-subrequest`)?.split(':') || []
        const value = prevs.concat(options.moduleName).join(':')
        init.headers.set('x-middleware-subrequest', value)

        if (!init.headers.has('user-agent')) {
          init.headers.set(`user-agent`, `Next.js Middleware`)
        }

        const response =
          typeof input === 'object' && 'url' in input
            ? __fetch(input.url, {
                ...pick(input, [
                  'method',
                  'body',
                  'cache',
                  'credentials',
                  'integrity',
                  'keepalive',
                  'mode',
                  'redirect',
                  'referrer',
                  'referrerPolicy',
                  'signal',
                ]),
                ...init,
                headers: {
                  ...Object.fromEntries(input.headers),
                  ...Object.fromEntries(init.headers),
                },
              })
            : __fetch(String(input), init)

        return await response.catch((err) => {
          callingError.message = err.message
          err.stack = callingError.stack
          throw err
        })
      }

      const __Request = context.Request
      context.Request = class extends __Request {
        next?: NextFetchRequestConfig | undefined
        constructor(input: URL | RequestInfo, init?: RequestInit | undefined) {
          const url =
            typeof input !== 'string' && 'url' in input
              ? input.url
              : String(input)
          validateURL(url)
          super(url, init)
          this.next = init?.next
        }
      }

      const __redirect = context.Response.redirect.bind(context.Response)
      context.Response.redirect = (...args) => {
        validateURL(args[0])
        return __redirect(...args)
      }

      for (const name of EDGE_UNSUPPORTED_NODE_APIS) {
        addStub(context, name)
      }

      Object.assign(context, wasm)

      context.AsyncLocalStorage = AsyncLocalStorage

      return context
    },
  })

  const decorateUnhandledError = getDecorateUnhandledError(runtime)
  runtime.context.addEventListener('error', decorateUnhandledError)
  const decorateUnhandledRejection = getDecorateUnhandledRejection(runtime)
  runtime.context.addEventListener(
    'unhandledrejection',
    decorateUnhandledRejection
  )

  return {
    runtime,
    paths: new Map<string, string>(),
    warnedEvals: new Set<string>(),
  }
}

interface ModuleContextOptions {
  moduleName: string
  onWarning: (warn: Error) => void
  useCache: boolean
  env: string[]
  distDir: string
  edgeFunctionEntry: Pick<EdgeFunctionDefinition, 'assets' | 'wasm'>
}

const pendingModuleCaches = new Map<string, Promise<ModuleContext>>()

function getModuleContextShared(options: ModuleContextOptions) {
  let deferredModuleContext = pendingModuleCaches.get(options.moduleName)
  if (!deferredModuleContext) {
    deferredModuleContext = createModuleContext(options)
    pendingModuleCaches.set(options.moduleName, deferredModuleContext)
  }
  return deferredModuleContext
}

/**
 * For a given module name this function will get a cached module
 * context or create it. It will return the module context along
 * with a function that allows to run some code from a given
 * filepath within the context.
 */
export async function getModuleContext(options: ModuleContextOptions): Promise<{
  evaluateInContext: (filepath: string) => void
  runtime: EdgeRuntime
  paths: Map<string, string>
  warnedEvals: Set<string>
}> {
  let lazyModuleContext:
    | UnwrapPromise<ReturnType<typeof getModuleContextShared>>
    | undefined

  if (options.useCache) {
    lazyModuleContext =
      moduleContexts.get(options.moduleName) ||
      (await getModuleContextShared(options))
  }

  if (!lazyModuleContext) {
    lazyModuleContext = await createModuleContext(options)
    moduleContexts.set(options.moduleName, lazyModuleContext)
  }

  const moduleContext = lazyModuleContext

  const evaluateInContext = (filepath: string) => {
    if (!moduleContext.paths.has(filepath)) {
      const content = readFileSync(filepath, 'utf-8')
      try {
        runInContext(content, moduleContext.runtime.context, {
          filename: filepath,
        })
        moduleContext.paths.set(filepath, content)
      } catch (error) {
        if (options.useCache) {
          moduleContext?.paths.delete(options.moduleName)
        }
        throw error
      }
    }
  }

  return { ...moduleContext, evaluateInContext }
}
