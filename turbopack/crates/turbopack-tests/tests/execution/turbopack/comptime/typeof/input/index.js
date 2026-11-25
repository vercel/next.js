import './cjs.js'
import './esm-automatic.js'
import './esm-specified.mjs'

it('evaluates typeof for a CommonJS module', () => {
  const { requireValue, ...types } = globalThis.typeofs['cjs']
  expect(types).toEqual({
    require: 'function',
    importMeta: 'object',
    module: 'object',
    exports: 'object',
  })
  // CJS gets the real (runtime) require
  expect(requireValue('path')).toBe(require('path'))
})

it.each(['esm-automatic', 'esm-specified'])(
  'evaluates typeof for an ESM module (%s)',
  (name) => {
    const { requireValue, ...types } = globalThis.typeofs[name]
    expect(types).toEqual({
      require: 'function',
      importMeta: 'object',
      module: 'undefined',
      exports: 'undefined',
    })
    // ESM gets a require stub
    expect(() => requireValue('./dep.js')).toThrow(
      'dynamic usage of require is not supported'
    )
  }
)
