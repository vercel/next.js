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
// *owns* the binding. These modules have their exports mangled, which splits each of them into a
// facade plus a `<locals>` module (see `EcmascriptExports::split_locals_and_reexports`); the
// bindings live on the locals module, and the facade only re-exposes them under their original
// names.
//
// That re-exposure is unconditionally a getter -- a facade forwards a name it does not own, so it
// cannot know the binding is never reassigned. Asserting on the namespace object of `import * as`
// therefore only ever observes the facade and says nothing about the optimization. These tests
// reach past it to the locals module, which is what actually decides value-vs-getter.
function localsNamespaceOf(fileName) {
  const suffix = `exports/live/input/${fileName} [test] (ecmascript) <locals>`
  const id = Array.from(__turbopack_modules__.keys()).find((m) =>
    m.endsWith(suffix)
  )
  // Not a soft check: without the split there is no locals module to inspect, and every
  // assertion below would be silently testing the facade instead.
  expect(id).toEqual(expect.stringContaining(suffix))
  return __turbopack_import__(id)
}

it('exported bindings that are not mutated are not live', () => {
  const locals = localsNamespaceOf('live_exports.js')
  // Mangled keys, so look up what each original name was emitted as.
  const info = liveExports.exportsInfo

  expectValue(locals, info.neverMutated.mangledName, 'neverMutated')
  expectValue(
    locals,
    info.obviouslyneverMutated.mangledName,
    'obviouslyneverMutated'
  )

  // `const_default_export_function.js` exports only `default`, and a module with a single export
  // to mangle always emits it under the same fixed key, so its namespace has exactly one own
  // enumerable property and no lookup table is needed to find it.
  const constDefaultLocals = localsNamespaceOf(
    'const_default_export_function.js'
  )
  const keys = Object.keys(constDefaultLocals)
  expect(keys).toHaveLength(1)
  expectValue(constDefaultLocals, keys[0], expect.any(Function))

  // The values are still reachable under the original names through the facade.
  expect(liveExports.neverMutated).toBe('neverMutated')
  expect(liveExports.obviouslyneverMutated).toBe('obviouslyneverMutated')
  expect(constDefaultExportFunction.default).toEqual(expect.any(Function))
})

it('exported bindings that are free vars are live', () => {
  // Reading `g` here is also what keeps it alive: export usage is tracked per name, so an export
  // this file never mentions is dropped from the locals module altogether and would have no
  // descriptor left to inspect.
  expect(liveExports.g).toBe(globalThis)

  const locals = localsNamespaceOf('live_exports.js')
  expectGetter(locals, liveExports.exportsInfo.g.mangledName)
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
