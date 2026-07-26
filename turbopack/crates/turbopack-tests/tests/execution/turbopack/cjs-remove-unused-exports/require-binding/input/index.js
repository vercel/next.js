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

const destructured = require('./destructured.js')
const { used } = destructured

it('narrows a require binding read through a destructuring pattern', () => {
  expect(used).toBe('used-value')
})

// A rest element observes every own property, so nothing may be dropped.
const rested = require('./rest.js')
const { used: restUsed, ...rest } = rested

it('keeps all exports when a require binding is destructured with a rest', () => {
  expect(restUsed).toBe('used-value')
  expect(rest.unused).toBe('unused-value')
})
