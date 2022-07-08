import type { Primitives } from 'next/dist/compiled/@edge-runtime/primitives'
import type { WasmBinding } from '../../../build/webpack/loaders/get-module-build-info'
import {
  decorateServerError,
  getServerError,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { EDGE_UNSUPPORTED_NODE_APIS } from '../../../shared/lib/constants'
import { EdgeRuntime } from 'next/dist/compiled/edge-runtime'
import { readFileSync, promises as fs } from 'fs'
import { validateURL } from '../utils'
import { pick } from '../../../lib/pick'

const WEBPACK_HASH_REGEX =
  /__webpack_require__\.h = function\(\) \{ return "[0-9a-f]+"; \}/g

interface ModuleContext {
  runtime: EdgeRuntime<Primitives>
  paths: Map<string, string>
  warnedEvals: Set<string>
}

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

/**
 * A Map of cached module contexts indexed by the module name. It allows
 * to have a different cache scoped per module name or depending on the
 * provided module key on creation.
 */
const moduleContexts = new Map<string, ModuleContext>()

interface ModuleContextOptions {
  moduleName: string
  onWarning: (warn: Error) => void
  useCache: boolean
  env: string[]
  wasm: WasmBinding[]
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
export async function getModuleContext(options: ModuleContextOptions) {
  let moduleContext = options.useCache
    ? moduleContexts.get(options.moduleName)
    : await getModuleContextShared(options)

  if (!moduleContext) {
    moduleContext = await createModuleContext(options)
    moduleContexts.set(options.moduleName, moduleContext)
  }

  const evaluateInContext = (filepath: string) => {
    if (!moduleContext!.paths.has(filepath)) {
      const content = readFileSync(filepath, 'utf-8')
      try {
        moduleContext?.runtime.evaluate(content)
        moduleContext!.paths.set(filepath, content)
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

/**
 * Create a module cache specific for the provided parameters. It includes
 * a runtime context, require cache and paths cache.
 */
async function createModuleContext(options: ModuleContextOptions) {
  const warnedEvals = new Set<string>()
  const warnedWasmCodegens = new Set<string>()
  const wasm = await loadWasm(options.wasm)
  const runtime = new EdgeRuntime({
    codeGeneration:
      process.env.NODE_ENV !== 'production'
        ? { strings: true, wasm: false }
        : undefined,
    extend: (context) => {
      context.process = createProcessPolyfill(options)

      context.__next_eval__ = function __next_eval__(fn: Function) {
        const key = fn.toString()
        if (!warnedEvals.has(key)) {
          const warning = new Error(
            `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware`
          )
          warning.name = 'DynamicCodeEvaluationWarning'
          Error.captureStackTrace(warning, __next_eval__)
          warnedEvals.add(key)
          options.onWarning(getServerError(warning, 'edge-server'))
        }
        return fn()
      }

      context.__next_webassembly_compile__ =
        function __next_webassembly_compile__(fn: Function) {
          const key = fn.toString()
          if (!warnedWasmCodegens.has(key)) {
            const warning = getServerError(
              new Error(
                "Dynamic WASM code generation (e. g. 'WebAssembly.compile') not allowed in Middleware.\n" +
                  'Learn More: https://nextjs.org/docs/messages/middleware-dynamic-wasm-compilation'
              ),
              'edge-server'
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
              new Error(
                "Dynamic WASM code generation ('WebAssembly.instantiate' with a buffer parameter) not allowed in Middleware.\n" +
                  'Learn More: https://nextjs.org/docs/messages/middleware-dynamic-wasm-compilation'
              ),
              'edge-server'
            )
            warning.name = 'DynamicWasmCodeGenerationWarning'
            Error.captureStackTrace(warning, __next_webassembly_instantiate__)
            warnedWasmCodegens.add(key)
            options.onWarning(warning)
          }
          return result
        }

      const __fetch = context.fetch
      context.fetch = (input: RequestInfo, init: RequestInit = {}) => {
        init.headers = new Headers(init.headers ?? {})
        const prevs =
          init.headers.get(`x-middleware-subrequest`)?.split(':') || []
        const value = prevs.concat(options.moduleName).join(':')
        init.headers.set('x-middleware-subrequest', value)

        if (!init.headers.has('user-agent')) {
          init.headers.set(`user-agent`, `Next.js Middleware`)
        }

        if (typeof input === 'object' && 'url' in input) {
          return __fetch(input.url, {
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
        }

        return __fetch(String(input), init)
      }

      const __Request = context.Request
      context.Request = class extends __Request {
        constructor(input: RequestInfo, init?: RequestInit | undefined) {
          const url = typeof input === 'string' ? input : input.url
          validateURL(url)
          super(input, init)
        }
      }

      const __redirect = context.Response.redirect.bind(context.Response)
      context.Response.redirect = (...args) => {
        validateURL(args[0])
        return __redirect(...args)
      }

      for (const name of EDGE_UNSUPPORTED_NODE_APIS) {
        addStub(context, name, options)
      }

      Object.assign(context, wasm)

      return context
    },
  })

  runtime.context.addEventListener('unhandledrejection', decorateUnhandledError)
  runtime.context.addEventListener('error', decorateUnhandledError)

  return {
    runtime,
    paths: new Map<string, string>(),
    warnedEvals: new Set<string>(),
  }
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

function buildEnvironmentVariablesFrom(
  keys: string[]
): Record<string, string | undefined> {
  const pairs = keys.map((key) => [key, process.env[key]])
  const env = Object.fromEntries(pairs)
  env.NEXT_RUNTIME = 'edge'
  return env
}

function createProcessPolyfill(
  options: Pick<ModuleContextOptions, 'env' | 'onWarning'>
) {
  const env = buildEnvironmentVariablesFrom(options.env)

  const processPolyfill = { env }
  const overridenValue: Record<string, any> = {}
  for (const key of Object.keys(process)) {
    if (key === 'env') continue
    Object.defineProperty(processPolyfill, key, {
      get() {
        emitWarning(`process.${key}`, options)
        return overridenValue[key]
      },
      set(value) {
        overridenValue[key] = value
      },
      enumerable: false,
    })
  }
  return processPolyfill
}

const warnedAlready = new Set<string>()

function addStub(
  context: Primitives,
  name: string,
  contextOptions: Pick<ModuleContextOptions, 'onWarning'>
) {
  Object.defineProperty(context, name, {
    get() {
      emitWarning(name, contextOptions)
      return undefined
    },
    enumerable: false,
  })
}

function emitWarning(
  name: string,
  contextOptions: Pick<ModuleContextOptions, 'onWarning'>
) {
  if (!warnedAlready.has(name)) {
    const warning =
      new Error(`You're using a Node.js API (${name}) which is not supported in the Edge Runtime that Middleware uses.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
    warning.name = 'NodejsRuntimeApiInMiddlewareWarning'
    contextOptions.onWarning(warning)
    console.warn(warning.message)
    warnedAlready.add(name)
  }
}

function decorateUnhandledError(error: any) {
  if (error instanceof Error) {
    decorateServerError(error, 'edge-server')
  }
}
