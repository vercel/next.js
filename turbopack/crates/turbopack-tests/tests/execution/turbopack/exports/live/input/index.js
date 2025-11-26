import * as liveExports from './live_exports.js'
import {
  default as liveDefaultClass,
  setDefaultClass,
} from './live_default_class.js'
import * as constDefaultExportFunction from './const_default_export_function.js'

it('hoisted declarations are live', () => {
  expect(liveExports.bar()).toBe('bar')
  liveExports.setBar(() => 'patched')
  expect(liveExports.bar()).toBe('patched')
})

it('default class export declarations are live', () => {
  expect(liveDefaultClass.default()).toBe('defaultClass')
  setDefaultClass(
    class {
      static default() {
        return 'patched'
      }
    }
  )
  expect(liveDefaultClass.default()).toBe('patched')
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
  // These should be bound to values, but we don't have the analysis yet
  expectGetter(liveExports, 'obviouslyneverMutated')
  expectGetter(liveExports, 'neverMutated')
  expectGetter(constDefaultExportFunction, 'default')
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
