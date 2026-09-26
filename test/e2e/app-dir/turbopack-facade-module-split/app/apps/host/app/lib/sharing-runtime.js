// Slim extraction of remote-components@0.4.15's ID-keyed shared-module
// installation, reduced to the parts this repro needs. Function semantics are
// taken from the package source (vercel/microfrontends):
//   src/runtime/turbopack/patterns.ts       (module-id regexes)
//   src/runtime/turbopack/shared-modules.ts (extractInlineSharedModuleIds,
//                                            installSharedModules)
//   src/runtime/turbopack/module.ts         (findModuleInit, requireModule,
//                                            handleTurbopackModule)
// It intentionally replicates the package's current resolution behavior:
// the async loader's target module ID is used as-is for the install, with no
// re-export-facade chasing.

// --- src/runtime/turbopack/patterns.ts (verbatim) ---
const MODULE_ID_PATTERN = '"[^"]+"|[0-9]+e[0-9]+|[0-9]+'

function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }
  return value
}

function normalizeModuleId(value) {
  if (/^[0-9]+e[0-9]+$/.test(value)) {
    return String(Number(value))
  }
  return value
}

function extractGroup(re, input, group) {
  const raw = re.exec(input)?.groups?.[group]
  if (!raw) return undefined
  return normalizeModuleId(stripQuotes(raw))
}

const INLINE_REMOTE_SHARED_RE =
  /[["']?__remote_shared_module_(?<specifier>[^"':\]]+)["']?\]?\s*:\s*\(\)\s*=>\s*(?:__turbopack_context__|[a-z])\.A\((?<asyncSharedModuleId>"[^"]+"|[0-9]+e[0-9]+|[0-9]+)\)/g

const ASYNC_MODULE_CALLBACK_RE = new RegExp(
  `(?:parentImport|[a-z])\\((?<sharedModuleId>${MODULE_ID_PATTERN})\\)`
)

// Webpack emits the manifest's dynamic import as
// `() => Promise.resolve().then(n.bind(n, 9535))` (fixture-level adaptation;
// the package's Turbopack patterns do not cover this shape).
const WEBPACK_DYNAMIC_IMPORT_RE =
  /\.bind\([A-Za-z0-9$_]+,\s*(?:\/\*[^*]*\*\/\s*)*(?:\\?"([^"\\]+)\\?"|(\d+))\s*\)/

// --- src/runtime/turbopack/module.ts (verbatim findModuleInit) ---
function findModuleInit(modules, moduleId) {
  if (!modules || typeof modules !== 'object') return undefined

  // Object format: { [id]: factory } (newer Next.js canary builds)
  if (!Array.isArray(modules)) {
    const key =
      moduleId in modules
        ? moduleId
        : Object.keys(modules).find((k) => k.startsWith(moduleId))
    return key !== undefined ? modules[key] : undefined
  }

  const flat = modules.flat()

  // Two-pass ID search: exact match first to avoid prefix false positives.
  let idx = flat.findIndex((e) => String(e) === String(moduleId))
  if (idx < 0) {
    idx = flat.findIndex((e) => typeof e === 'string' && e.startsWith(moduleId))
  }
  if (idx >= 0) {
    // Factory is the first function entry that follows the module ID
    return flat.slice(idx + 1).find((e) => typeof e === 'function')
  }

  // Embedded object map: entries of the form { [moduleId]: factory }
  for (const entry of flat) {
    if (!entry || typeof entry !== 'object') continue
    if (moduleId in entry) return entry[moduleId]
    const prefixKey = Object.keys(entry).find((k) => k.startsWith(moduleId))
    if (prefixKey) return entry[prefixKey]
  }
  return undefined
}

// --- src/runtime/turbopack/shared-modules.ts ---
// extractInlineSharedModuleIds, reduced to one specifier: finds the shared
// manifest module by its `__remote_shared_module_` functions and resolves
// the dynamic import's target module ID exactly the way the package does
// (loader module source -> final parentImport/id call).

// Iterates [id, factory] pairs over a scope's raw pushed entries, covering
// flat [id, fn] layouts, runtime-native [script, [id, fn]] nesting, and
// webpack {id: factory} object maps.
function moduleEntries(turbopackModules) {
  const out = []
  let lastId = undefined
  const walk = (entry) => {
    if (Array.isArray(entry)) {
      entry.forEach(walk)
      return
    }
    if (entry && typeof entry === 'object') {
      if (entry instanceof Element) {
        return
      }
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === 'function') {
          out.push([key, value])
        }
      }
      return
    }
    if (typeof entry === 'function') {
      out.push([lastId, entry])
      lastId = undefined
      return
    }
    lastId = entry
  }
  turbopackModules.forEach(walk)
  return out
}

export function resolveSharedModuleId(allModules, specifier) {
  for (const [, idOrFunc] of moduleEntries(allModules)) {
    if (typeof idOrFunc !== 'function') continue

    const funcCode = idOrFunc.toString()
    if (!funcCode.includes('__remote_shared_module_')) continue

    INLINE_REMOTE_SHARED_RE.lastIndex = 0
    for (const match of funcCode.matchAll(INLINE_REMOTE_SHARED_RE)) {
      const foundSpecifier = match.groups?.specifier
      const rawAsyncSharedModuleId = match.groups?.asyncSharedModuleId
      if (foundSpecifier !== specifier || !rawAsyncSharedModuleId) continue

      const asyncSharedModuleId = normalizeModuleId(
        stripQuotes(rawAsyncSharedModuleId)
      )
      const asyncSharedModule = findModuleInit(allModules, asyncSharedModuleId)
      if (!asyncSharedModule) continue

      const sharedModuleId = extractGroup(
        ASYNC_MODULE_CALLBACK_RE,
        asyncSharedModule.toString(),
        'sharedModuleId'
      )
      return sharedModuleId ?? asyncSharedModuleId
    }

    // Webpack shape (fixture-level adaptation).
    const webpackMatch = funcCode.match(WEBPACK_DYNAMIC_IMPORT_RE)
    if (webpackMatch && funcCode.includes(`__remote_shared_module_`)) {
      return webpackMatch[1] || webpackMatch[2]
    }
  }

  // Mirrors the package's remoteShared-manifest fallback: when the inline
  // extraction finds nothing (development keeps bracket-quoted manifest
  // keys), resolve through the requirement path, which matches consumer
  // string ids by suffix (matchesSharedModuleKey).
  for (const [, idOrFunc] of moduleEntries(allModules)) {
    if (typeof idOrFunc !== 'function') continue
    if (!idOrFunc.toString().includes('__remote_shared_module_')) continue
    return '/demo-pkg/index.js'
  }
  return undefined
}

// --- src/runtime/turbopack/module.ts ---
// getSharedModule / matchesSharedModuleKey (verbatim semantics).
function matchesSharedModuleKey(id, key) {
  if (!key.includes('/') && !key.endsWith('.js')) return false
  if (id.endsWith(key)) return true
  const index = id.lastIndexOf(key)
  if (index < 0) return false
  const afterKey = id.slice(index + key.length)
  return /^\s+(?:\[[^\]]+\]\s*)?(?:\([^)]*\))?$/.test(afterKey)
}

function getSharedModule(scope, id) {
  const idStr = String(id)
  if (scope.sharedModules[idStr] !== undefined) {
    return scope.sharedModules[idStr]
  }
  for (const [key, value] of Object.entries(scope.sharedModules)) {
    if (
      typeof value !== 'undefined' &&
      idStr !== key &&
      matchesSharedModuleKey(idStr, key)
    ) {
      return value
    }
  }
  return null
}

// installSharedModules (reduced): the host instance is registered at the
// resolved module ID and any cached remote copy for that ID is dropped.
export function installSharedModule(scope, id, hostExports) {
  scope.sharedModules[id] = hostExports
  delete scope.moduleCache[id]
}

// requireModule + handleTurbopackModule (verbatim semantics, minimal context).
export function requireModule(scope, moduleId) {
  const idStr = String(moduleId)

  const sharedModule = getSharedModule(scope, moduleId)
  if (sharedModule !== null) {
    return sharedModule
  }

  if (scope.moduleCache[idStr]) return scope.moduleCache[idStr]

  return handleModule(scope, idStr)
}

function handleModule(scope, moduleId) {
  if (scope.moduleCache[moduleId]) {
    return scope.moduleCache[moduleId]
  }

  const modules = scope.turbopackModules
  const moduleInit = findModuleInit(modules, moduleId)
  const exports = {}
  const moduleExports = { exports }

  if (typeof moduleInit !== 'function') {
    throw new Error(`Module ${moduleId} not found in bundle ${scope.name}`)
  }

  scope.moduleCache[moduleId] = moduleExports.exports

  if (moduleInit.length >= 2) {
    // Webpack factory shape: (module, exports, require). Harmony helpers are
    // a fixture-level adaptation of what webpack modules use.
    const n = (id) => requireModule(scope, id)
    n.d = (target, definition) => {
      for (const key in definition) {
        Object.defineProperty(target, key, {
          get: definition[key],
          enumerable: true,
        })
      }
    }
    n.r = (target) => {
      Object.defineProperty(target, '__esModule', { value: true })
    }
    moduleInit(moduleExports, moduleExports.exports, n)
  } else {
    moduleInit(
      createContext(scope, exports, moduleExports),
      moduleExports,
      exports
    )
  }

  if (scope.moduleCache[moduleId] !== moduleExports.exports) {
    scope.moduleCache[moduleId] = moduleExports.exports
  }

  return moduleExports.exports
}

function createContext(scope, exports, moduleExports) {
  const scopedRequire = (moduleId) => requireModule(scope, moduleId)

  return {
    // HMR API surface (development factories register through it)
    k: {
      register() {},
      registerExports() {},
      signature() {
        return (fn) => fn
      },
    },

    // ESM exports setup
    s(bindings, esmId) {
      let mod = exports
      if (typeof esmId === 'string' || typeof esmId === 'number') {
        if (!scope.moduleCache[esmId]) {
          scope.moduleCache[esmId] = {}
        }
        mod = scope.moduleCache[esmId]
      }

      Object.defineProperty(mod, '__esModule', { value: true })
      if (Array.isArray(bindings)) {
        let i = 0
        while (i < bindings.length) {
          const propName = bindings[i++]
          const tagOrFunc = bindings[i++]
          if (typeof tagOrFunc === 'number') {
            Object.defineProperty(mod, propName, {
              value: bindings[i++],
              enumerable: true,
              writable: false,
            })
          } else {
            const getterFn = tagOrFunc
            if (typeof bindings[i] === 'function') {
              const setterFn = bindings[i++]
              Object.defineProperty(mod, propName, {
                get: getterFn,
                set: setterFn,
                enumerable: true,
              })
            } else {
              Object.defineProperty(mod, propName, {
                get: getterFn,
                enumerable: true,
              })
            }
          }
        }
      }
    },

    // import
    i(importId) {
      return scopedRequire(importId)
    },

    // async import: resolves the loader's target synchronously is not
    // possible; return a promise of the required module.
    A(loaderId) {
      return Promise.resolve().then(() => scopedRequire(loaderId))
    },

    // async module registration: invoke the callback with the scoped require.
    v(register) {
      return register(scopedRequire)
    },
  }
}

// Webpack module execution: webpack factories take (module, exports, require)
// and use n.d / n.r for harmony exports (fixture-level adaptation).
export function requireWebpackModule(scope, moduleId) {
  const idStr = String(moduleId)
  const sharedModule = getSharedModule(scope, moduleId)
  if (sharedModule !== null) {
    return sharedModule
  }
  if (scope.moduleCache[idStr]) return scope.moduleCache[idStr]

  const factory = findModuleInit(scope.turbopackModules, moduleId)
  if (typeof factory !== 'function') {
    throw new Error(`Module ${moduleId} not found in bundle ${scope.name}`)
  }

  const module = { exports: {} }
  scope.moduleCache[idStr] = module.exports

  const n = (id) => requireWebpackModule(scope, id)
  n.d = (exports, definition) => {
    for (const key in definition) {
      Object.defineProperty(exports, key, {
        get: definition[key],
        enumerable: true,
      })
    }
  }
  n.r = (exports) => {
    Object.defineProperty(exports, '__esModule', { value: true })
  }

  factory(module, module.exports, n)
  return module.exports
}

export function createScope(name, globalProp) {
  return {
    name,
    globalProp,
    turbopackModules: [],
    sharedModules: {},
    moduleCache: {},
    chunkCache: {},
  }
}

export function findModuleByMarker(scope, marker) {
  for (const [id, entry] of moduleEntries(scope.turbopackModules)) {
    if (typeof entry !== 'function') continue
    if (entry.toString().includes(marker)) {
      if (id !== undefined) {
        return String(id)
      }
    }
  }
  return undefined
}

// Extracts the module IDs a factory imports. Covers turbopack `ctx.i(<id>)`,
// minified webpack `x=n(<id>)` bindings, and dev webpack `__webpack_require__`
// calls (with `/*! ... */` comments and escaped quotes in eval sources).
export function findModuleImports(scope, moduleId) {
  const init = findModuleInit(scope.turbopackModules, moduleId)
  if (typeof init !== 'function') return []
  const src = init.toString()
  const ids = []
  for (const m of src.matchAll(
    /[A-Za-z0-9$_]+\.i\(\s*(?:"([^"]+)"|(\d+))\s*\)/g
  )) {
    ids.push(m[1] || m[2])
  }
  for (const m of src.matchAll(
    /[A-Za-z0-9$_]+\s*=\s*[A-Za-z0-9$_]+\(\s*(?:\\?"([^"\\]+)\\?"|(\d+))\s*\)/g
  )) {
    ids.push(m[1] || m[2])
  }
  for (const m of src.matchAll(
    /__webpack_require__\(\s*(?:\/\*[^*]*\*\/\s*)*(?:\\?"([^"\\]+)\\?"|(\d+))\s*\)/g
  )) {
    ids.push(m[1] || m[2])
  }
  return [...new Set(ids)]
}

// Reads a field off the singleton object inside a namespace-shaped module
// export, without depending on export names (which export mangling rewrites).
export function readSingletonValue(ns, field) {
  if (!ns || typeof ns !== 'object') return undefined
  if (ns[field] !== undefined) return ns[field]
  if (ns.singleton && typeof ns.singleton === 'object') {
    return ns.singleton[field]
  }
  for (const value of Object.values(ns)) {
    if (value && typeof value === 'object' && field in value) {
      return value[field]
    }
  }
  return undefined
}

export function moduleExportsHasSingleton(ns) {
  return readSingletonValue(ns, 'instanceId') !== undefined
}
