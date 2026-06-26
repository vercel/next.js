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
  expect(
    Object.getOwnPropertyDescriptor(liveExports, 'obviouslyneverMutated')
  ).toEqual({
    configurable: false,
    enumerable: true,
    value: 'obviouslyneverMutated',
    writable: false,
  })
  expect(Object.getOwnPropertyDescriptor(liveExports, 'neverMutated')).toEqual({
    configurable: false,
    enumerable: true,
    value: 'neverMutated',
    writable: false,
  })
  expect(
    Object.getOwnPropertyDescriptor(constDefaultExportFunction, 'default')
  ).toEqual({
    configurable: false,
    enumerable: true,
    value: constDefaultExportFunction.default,
    writable: false,
  })
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
