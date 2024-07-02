import type { AssetBinding } from '../../../build/webpack/loaders/get-module-build-info'
import type {
  EdgeFunctionDefinition,
  SUPPORTED_NATIVE_MODULES,
} from '../../../build/webpack/plugins/middleware-plugin'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import { AsyncLocalStorage } from 'async_hooks'
import {
  COMPILER_NAMES,
  EDGE_UNSUPPORTED_NODE_APIS,
} from '../../../shared/lib/constants'
import { EdgeRuntime } from 'next/dist/compiled/edge-runtime'
import { readFileSync, promises as fs } from 'fs'
import { validateURL } from '../utils'
import { pick } from '../../../lib/pick'
import { fetchInlineAsset } from './fetch-inline-assets'
import { runInContext } from 'vm'
import BufferImplementation from 'node:buffer'
import EventsImplementation from 'node:events'
import AssertImplementation from 'node:assert'
import UtilImplementation from 'node:util'
import AsyncHooksImplementation from 'node:async_hooks'
import { intervalsManager, timeoutsManager } from './resource-managers'

interface ModuleContext {
  runtime: EdgeRuntime
  paths: Map<string, string>
  warnedEvals: Set<string>
}

let getServerError: typeof import('../../../client/components/react-dev-overlay/server/middleware').getServerError
let decorateServerError: typeof import('../../../shared/lib/error-source').decorateServerError

if (process.env.NODE_ENV === 'development') {
  const middleware = require('../../../client/components/react-dev-overlay/server/middleware')
  getServerError = middleware.getServerError
  decorateServerError =
    require('../../../shared/lib/error-source').decorateServerError
} else {
  getServerError = (error: Error, _: string) => error
  decorateServerError = (_: Error, __: string) => {}
}

/**
 * A Map of cached module contexts indexed by the module name. It allows
 * to have a different cache scoped per module name or depending on the
 * provided module key on creation.
 */
const moduleContexts = new Map<string, ModuleContext>()

const pendingModuleCaches = new Map<string, Promise<ModuleContext>>()

/**
 * Same as clearModuleContext but for all module contexts.
 */
export async function clearAllModuleContexts() {
  intervalsManager.removeAll()
  timeoutsManager.removeAll()
  moduleContexts.clear()
  pendingModuleCaches.clear()
}

/**
 * For a given path a context, this function checks if there is any module
 * context that contains the path with an older content and, if that's the
 * case, removes the context from the cache.
 *
 * This function also clears all intervals and timeouts created by the
 * module context.
 */
export async function clearModuleContext(path: string) {
  intervalsManager.removeAll()
  timeoutsManager.removeAll()

  const handleContext = (
    key: string,
    cache: ReturnType<(typeof moduleContexts)['get']>,
    context: typeof moduleContexts | typeof pendingModuleCaches
  ) => {
    if (cache?.paths.has(path)) {
      context.delete(key)
    }
  }

  for (const [key, cache] of moduleContexts) {
    handleContext(key, cache, moduleContexts)
  }
  for (const [key, cache] of pendingModuleCaches) {
    handleContext(key, await cache, pendingModuleCaches)
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
  injectedEnvironments: Record<string, string>
): Record<string, string | undefined> {
  const pairs = Object.keys(process.env).map((key) => [key, process.env[key]])
  const env = Object.fromEntries(pairs)
  for (const key of Object.keys(injectedEnvironments)) {
    env[key] = injectedEnvironments[key]
  }
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

function createProcessPolyfill(env: Record<string, string>) {
  const processPolyfill = { env: buildEnvironmentVariablesFrom(env) }
  const overriddenValue: Record<string, any> = {}

  for (const key of Object.keys(process)) {
    if (key === 'env') continue
    Object.defineProperty(processPolyfill, key, {
      get() {
        if (overriddenValue[key] !== undefined) {
          return overriddenValue[key]
        }
        if (typeof (process as any)[key] === 'function') {
          return () => throwUnsupportedAPIError(`process.${key}`)
        }
        return undefined
      },
      set(value) {
        overriddenValue[key] = value
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

const NativeModuleMap = (() => {
  const mods: Record<
    `node:${(typeof SUPPORTED_NATIVE_MODULES)[number]}`,
    unknown
  > = {
    'node:buffer': pick(BufferImplementation, [
      'constants',
      'kMaxLength',
      'kStringMaxLength',
      'Buffer',
      'SlowBuffer',
    ]),
    'node:events': pick(EventsImplementation, [
      'EventEmitter',
      'captureRejectionSymbol',
      'defaultMaxListeners',
      'errorMonitor',
      'listenerCount',
      'on',
      'once',
    ]),
    'node:async_hooks': pick(AsyncHooksImplementation, [
      'AsyncLocalStorage',
      'AsyncResource',
    ]),
    'node:assert': pick(AssertImplementation, [
      'AssertionError',
      'deepEqual',
      'deepStrictEqual',
      'doesNotMatch',
      'doesNotReject',
      'doesNotThrow',
      'equal',
      'fail',
      'ifError',
      'match',
      'notDeepEqual',
      'notDeepStrictEqual',
      'notEqual',
      'notStrictEqual',
      'ok',
      'rejects',
      'strict',
      'strictEqual',
      'throws',
    ]),
    'node:util': pick(UtilImplementation, [
      '_extend' as any,
      'callbackify',
      'format',
      'inherits',
      'promisify',
      'types',
    ]),
  }
  return new Map(Object.entries(mods))
})()

export const requestStore = new AsyncLocalStorage<{
  headers: Headers
}>()

/**
 * Create a module cache specific for the provided parameters. It includes
 * a runtime context, require cache and paths cache.
 */
async function createModuleContext(options: ModuleContextOptions) {
  const warnedEvals = new Set<string>()
  const warnedWasmCodegens = new Set<string>()
  const { edgeFunctionEntry } = options
  const wasm = await loadWasm(edgeFunctionEntry.wasm ?? [])
  const runtime = new EdgeRuntime({
    codeGeneration:
      process.env.NODE_ENV !== 'production'
        ? { strings: true, wasm: true }
        : undefined,
    extend: (context) => {
      context.process = createProcessPolyfill(edgeFunctionEntry.env)

      Object.defineProperty(context, 'require', {
        enumerable: false,
        value: (id: string) => {
          const value = NativeModuleMap.get(id)
          if (!value) {
            throw TypeError('Native module not found: ' + id)
          }
          return value
        },
      })

      if (process.env.NODE_ENV !== 'production') {
        context.__next_log_error__ = function (err: unknown) {
          options.onError(err)
        }
      }

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
          // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/instantiate#primary_overload_%E2%80%94_taking_wasm_binary_code
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

        // Forward subrequest header from incoming request to outgoing request
        const store = requestStore.getStore()
        if (
          store?.headers.has('x-middleware-subrequest') &&
          !init.headers.has('x-middleware-subrequest')
        ) {
          init.headers.set(
            'x-middleware-subrequest',
            store.headers.get('x-middleware-subrequest') ?? ''
          )
        }

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

      context.performance = performance

      context.AsyncLocalStorage = AsyncLocalStorage

      // @ts-ignore the timeouts have weird types in the edge runtime
      context.setInterval = (...args: Parameters<typeof setInterval>) =>
        intervalsManager.add(args)

      // @ts-ignore the timeouts have weird types in the edge runtime
      context.clearInterval = (interval: number) =>
        intervalsManager.remove(interval)

      // @ts-ignore the timeouts have weird types in the edge runtime
      context.setTimeout = (...args: Parameters<typeof setTimeout>) =>
        timeoutsManager.add(args)

      // @ts-ignore the timeouts have weird types in the edge runtime
      context.clearTimeout = (timeout: number) =>
        timeoutsManager.remove(timeout)

      if (process.env.__NEXT_TEST_MODE) {
        context.__next_outer_globalThis__ = globalThis
      }

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
  onError: (err: unknown) => void
  onWarning: (warn: Error) => void
  useCache: boolean
  distDir: string
  edgeFunctionEntry: Pick<EdgeFunctionDefinition, 'assets' | 'wasm' | 'env'>
}

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
          moduleContext?.paths.delete(filepath)
        }
        throw error
      }
    }
  }

  return { ...moduleContext, evaluateInContext }
}
