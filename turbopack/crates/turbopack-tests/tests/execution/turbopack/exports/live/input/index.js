import * as liveDefaultClass from './live_default_class.js'
import * as liveExports from './live_exports.js'
import * as constDefaultExportFunction from './const_default_export_function.js'

it('hoisted declarations are live', () => {
  expect(liveExports.bar()).toBe('bar')
  liveExports.setBar(() => 'patched')
  expect(liveExports.bar()).toBe('patched')
})

it('default class export declarations are live', () => {
  expect(liveDefaultClass.default.default()).toBe('defaultClass')
  liveDefaultClass.setDefaultClass(
    class {
      static default() {
        return 'patched'
      }
    }
  )
  expect(liveDefaultClass.default.default()).toBe('patched')
})

it('default function export declarations are live', () => {
  expect(liveExports.default()).toBe('defaultFunction')
  liveExports.setDefaultFunction(() => 'patched')
  expect(liveExports.default()).toBe('patched')
})

it('exported lets are live', () => {
  expect(liveExports.foo).toBe('foo')
  liveExports.setFoo('new')
  expect(liveExports.foo).toBe('new')
})

// Whether a binding is emitted as a plain value or as a getter is decided by the module that
// *owns* it. A local-only module is no longer split merely for export mangling, so its namespace
// is the right place to inspect the emitted property descriptors. Look up its exact module ID to
// avoid accidentally testing a re-export facade instead of the original module.
function moduleNamespaceOf(fileName) {
  const suffix = `exports/live/input/${fileName} [test] (ecmascript)`
  const id = Array.from(__turbopack_modules__.keys()).find((m) =>
    m.endsWith(suffix)
  )
  expect(id).toEqual(expect.stringContaining(suffix))
  return __turbopack_import__(id)
}

it('exported bindings that are not mutated are not live', () => {
  const ns = moduleNamespaceOf('live_exports.js')
  const info = liveExports.exportsInfo
  // This module's export keys can still be mangled when all reads are statically known.
  expectValue(ns, info.neverMutated.mangledName, 'neverMutated')
  expectValue(
    ns,
    info.obviouslyneverMutated.mangledName,
    'obviouslyneverMutated'
  )

  const constDefaultNs = moduleNamespaceOf('const_default_export_function.js')
  const keys = Object.keys(constDefaultNs)
  expect(keys).toHaveLength(1)
  expectValue(constDefaultNs, keys[0], expect.any(Function))

  // The values are still reachable under the original names.
  expect(liveExports.neverMutated).toBe('neverMutated')
  expect(liveExports.obviouslyneverMutated).toBe('obviouslyneverMutated')
  expect(constDefaultExportFunction.default).toEqual(expect.any(Function))
})

it('exported bindings that are free vars are live', () => {
  // Reading `g` here is also what keeps it alive: export usage is tracked per name, so an export
  // this file never mentions can be dropped and would have no descriptor left to inspect.
  expect(liveExports.g).toBe(globalThis)

  const ns = moduleNamespaceOf('live_exports.js')
  expectGetter(ns, liveExports.exportsInfo.g.mangledName)
})

function expectValue(ns, propName, value) {
  expect(Object.getOwnPropertyDescriptor(ns, propName)).toEqual({
    value,
    writable: false,
    enumerable: true,
    configurable: false,
  })
}

function expectGetter(ns, propName) {
  const desc = Object.getOwnPropertyDescriptor(ns, propName)
  expect(desc).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      set: undefined,
    })
  )
  expect(desc).toHaveProperty('get')
}
