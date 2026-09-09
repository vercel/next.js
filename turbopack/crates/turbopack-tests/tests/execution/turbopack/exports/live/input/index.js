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

it('exported bindings that are not mutated are not live', () => {
  // `liveExports` is read through a namespace import (`import * as liveExports`), so once export
  // mangling is enabled globally, `live_exports.js` structurally splits into a facade and a
  // locals module (mangling itself still backs off here -- the namespace escapes -- but the
  // *split* is a static, per-module decision that can't see that yet; see
  // `EcmascriptExports::split_locals_and_reexports`). Reading a binding across that facade
  // boundary always goes through a getter (`ReferencedAssetIdent::Module` in
  // `EsmExports::code_generation`), regardless of the binding's own liveness -- the same
  // pessimization already accepted for any other cross-module reference, just newly visible here.
  // The values stay correct; only the property-descriptor shape changes from a plain value to an
  // always-fresh getter.
  expect(
    Object.getOwnPropertyDescriptor(liveExports, 'obviouslyneverMutated')
  ).toEqual({
    configurable: false,
    enumerable: true,
    get: expect.any(Function),
    set: undefined,
  })
  expect(liveExports.obviouslyneverMutated).toBe('obviouslyneverMutated')
  expect(Object.getOwnPropertyDescriptor(liveExports, 'neverMutated')).toEqual({
    configurable: false,
    enumerable: true,
    get: expect.any(Function),
    set: undefined,
  })
  expect(liveExports.neverMutated).toBe('neverMutated')
  expect(
    Object.getOwnPropertyDescriptor(constDefaultExportFunction, 'default')
  ).toEqual({
    configurable: false,
    enumerable: true,
    get: expect.any(Function),
    set: undefined,
  })
  expect(constDefaultExportFunction.default).toEqual(expect.any(Function))
})

it('exported bindings that are free vars are live', () => {
  expectGetter(liveExports, 'g')
})

function expectGetter(ns, propName) {
  const gDesc = Object.getOwnPropertyDescriptor(ns, propName)
  expect(gDesc).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      set: undefined,
    })
  )
  expect(gDesc).toHaveProperty('get')
}
