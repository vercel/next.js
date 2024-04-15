declare const _ENTRIES: any

async function registerInstrumentation() {
  const register =
    '_ENTRIES' in globalThis &&
    _ENTRIES.middleware_instrumentation &&
    (await _ENTRIES.middleware_instrumentation).register
  if (register) {
    try {
      await register()
    } catch (err: any) {
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    }
  }
}

let registerInstrumentationPromise: Promise<void> | null = null
export function ensureInstrumentationRegistered() {
  if (!registerInstrumentationPromise) {
    registerInstrumentationPromise = registerInstrumentation()
  }
  return registerInstrumentationPromise
}

function getUnsupportedModuleErrorMessage(module: string) {
  // warning: if you change these messages, you must adjust how react-dev-overlay's middleware detects modules not found
  return `The edge runtime does not support Node.js '${module}' module.
Learn More: https://nextjs.org/docs/messages/node-module-in-edge-runtime`
}

function __import_unsupported(moduleName: string) {
  const proxy: any = new Proxy(function () {}, {
    get(_obj, prop) {
      if (prop === 'then') {
        return {}
      }
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
    construct() {
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
    apply(_target, _this, args) {
      if (typeof args[0] === 'function') {
        return args[0](proxy)
      }
      throw new Error(getUnsupportedModuleErrorMessage(moduleName))
    },
  })
  return new Proxy({}, { get: () => proxy })
}

function enhanceGlobals() {
  // The condition is true when the "process" module is provided
  if (process !== global.process) {
    // prefer local process but global.process has correct "env"
    process.env = global.process.env
    global.process = process
  }

  // to allow building code that import but does not use node.js modules,
  // webpack will expect this function to exist in global scope
  Object.defineProperty(globalThis, '__import_unsupported', {
    value: __import_unsupported,
    enumerable: false,
    configurable: false,
  })

  // Eagerly fire instrumentation hook to make the startup faster.
  void ensureInstrumentationRegistered()
}

enhanceGlobals()
