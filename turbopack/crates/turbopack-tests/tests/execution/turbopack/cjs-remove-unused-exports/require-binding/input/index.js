const lib = require('./lib.js')
const { moduleCode } = require('../../../__helpers__/module-factories.js')

it('narrows a require binding used only via members', () => {
  expect(lib.used).toBe('used-value')

  // `lib` is only ever read via `.used`, so `exports.unused` is dropped.
  const code = moduleCode('lib.js')
  expect(code).toContain("exports.used = 'used-value'")
  expect(code).not.toContain('exports.unused')
})

// `escaped` is used wholesale, so every export must remain reachable — if the
// escape analysis missed this, `escaped.unused` would have been dropped.
const escaped = require('./escaped.js')
globalThis.__cjs_escaped = escaped

it('keeps all exports when a require binding escapes', () => {
  expect(globalThis.__cjs_escaped.used).toBe('used-value')
  expect(globalThis.__cjs_escaped.unused).toBe('unused-value')
})
