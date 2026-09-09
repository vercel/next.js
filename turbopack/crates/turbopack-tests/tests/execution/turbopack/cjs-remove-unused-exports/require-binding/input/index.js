const lib = require('./lib.js')

it('narrows a require binding used only via members', () => {
  expect(lib.used).toBe('used-value')
})

// `escaped` is used wholesale, so every export must remain reachable — if the
// escape analysis missed this, `escaped.unused` would have been dropped.
const escaped = require('./escaped.js')
globalThis.__cjs_escaped = escaped

it('keeps all exports when a require binding escapes', () => {
  expect(globalThis.__cjs_escaped.used).toBe('used-value')
  expect(globalThis.__cjs_escaped.unused).toBe('unused-value')
})
