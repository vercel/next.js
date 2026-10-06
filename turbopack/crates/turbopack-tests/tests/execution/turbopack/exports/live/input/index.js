import * as liveDefaultClass from './live_default_class.js'
import * as liveExports from './live_exports.js'
import * as constDefaultExportFunction from './const_default_export_function.js'
import constantDefault, { constant, live, setLive } from './import_bindings.js'
import { result as circularResult } from './cycle_a.js'
import reexportedConstantDefault, {
  constant as reexportedConstant,
  live as reexportedLive,
  setLive as reexportedSetLive,
} from './import_bindings_reexport.js'
import { result as reexportedCircularResult } from './cycle_reexport.js'

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
// *owns* it. Materialized-namespace mangling splits the public facade from its `<locals>` module,
// so inspect the latter's descriptors rather than those on the forwarding facade.
function moduleNamespaceOf(fileName) {
  const suffix = `exports/live/input/${fileName} [test] (ecmascript) <locals>`
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

it('direct constant imports retain value and call semantics', () => {
  expect(constant).toBe('constant')
  expect({ constant }).toEqual({ constant: 'constant' })
  expect(constantDefault()).toBe('constant-default')
})

it('direct live imports observe updates', () => {
  expect(live).toBe('initial')
  setLive('updated')
  expect(live).toBe('updated')
})

it('constant imports in a cycle are not captured before evaluation', () => {
  expect(circularResult).toBe('a')
})

it('re-exported constant imports retain value and call semantics', () => {
  expect(reexportedConstant).toBe('constant')
  expect({ reexportedConstant }).toEqual({ reexportedConstant: 'constant' })
  expect(reexportedConstantDefault()).toBe('constant-default')
})

it('re-exported live imports observe updates', () => {
  // Both imports read the same binding, whichever test changed it last.
  expect(reexportedLive).toBe(live)
  reexportedSetLive('updated through the re-export')
  expect(reexportedLive).toBe('updated through the re-export')
  expect(live).toBe('updated through the re-export')
})

it('re-exported constant imports in a cycle are not captured before evaluation', () => {
  expect(reexportedCircularResult).toBe('a')
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
