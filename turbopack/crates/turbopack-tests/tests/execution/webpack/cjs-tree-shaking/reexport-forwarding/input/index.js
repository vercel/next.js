it('A: should tree-shake through a 4-level CJS star-reexport chain', () => {
  const d = require('./a-l4')
  expect(d.a).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(d.aUsed).toBe(true)
    expect(d.bUsed).toBe(false) // b is never read across the chain
  }
})

it('D: should tree-shake a CJS star-reexport of an ESM `export *` barrel', () => {
  const d = require('./d-cjs')
  expect(d.m).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(d.mUsed).toBe(true)
    expect(d.nUsed).toBe(false)
  }
})

it('E: should handle circular CJS star-reexports at runtime', () => {
  const one = require('./e-one')
  expect(one.second).toBe(2)
})

it('G: should tree-shake a diamond of CJS reexports with disjoint usage', () => {
  const a = require('./g-p1').a
  const b = require('./g-p2').b
  expect(a).toBe(1)
  expect(b).toBe(2)
  if (process.env.NODE_ENV === 'production') {
    // each property is pulled through a different reexport path
    expect(require('./g-p1').aUsed).toBe(true)
    expect(require('./g-p2').bUsed).toBe(true)
    expect(require('./g-p1').cUsed).toBe(false) // c used through neither path
  }
})

it('H: should resolve mutually circular CJS star-reexports at runtime', () => {
  const a = require('./h-a')
  expect(a.onlyB).toBe('B')
  expect(a.alsoB).toBe('B2')
  expect('onlyA' in a).toBe(false) // overwritten by module.exports = require("./h-b")
})
