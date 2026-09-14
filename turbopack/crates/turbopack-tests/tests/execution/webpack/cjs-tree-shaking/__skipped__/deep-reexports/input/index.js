it('A: should tree-shake through a 4-level CJS star-reexport chain', () => {
  const d = require('./a-l4')
  expect(d.a).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(d.aUsed).toBe(true)
    expect(d.bUsed).toBe(false) // b is never read across the chain
  }
})

it('B: should tree-shake a nested namespace reexported through CJS', () => {
  const m = require('./b-mid')
  expect(m.inner.x).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(m.inner.xUsed).toBe(true)
    expect(m.inner.yUsed).toBe(false) // y only reachable via m.inner, never read
  }
})

it('C: should tree-shake a sub-namespace star-reexport (ids != [])', () => {
  const m = require('./c-mid')
  expect(m.p).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(m.pUsed).toBe(true)
    expect(m.qUsed).toBe(false)
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

it('F: should tree-shake a depth-2 nested namespace reexported through CJS', () => {
  const m = require('./f-cjs')
  expect(m.mid.deep.x).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(m.mid.deep.xUsed).toBe(true)
    expect(m.mid.deep.yUsed).toBe(false) // y reachable only via m.mid.deep, never read
  }
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

it('J: should tree-shake when ids unwrap a namespace after a star hop', () => {
  const m = require('./j-hop2')
  expect(m.w).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(m.wUsed).toBe(true)
    expect(m.zUsed).toBe(false)
  }
})

it('H: should resolve mutually circular CJS star-reexports at runtime', () => {
  const a = require('./h-a')
  expect(a.onlyB).toBe('B')
  expect(a.alsoB).toBe('B2')
  expect('onlyA' in a).toBe(false) // overwritten by module.exports = require("./h-b")
})
