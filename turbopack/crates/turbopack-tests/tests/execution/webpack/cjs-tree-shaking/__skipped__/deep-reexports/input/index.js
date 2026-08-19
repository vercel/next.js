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

it('F: should tree-shake a depth-2 nested namespace reexported through CJS', () => {
  const m = require('./f-cjs')
  expect(m.mid.deep.x).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(m.mid.deep.xUsed).toBe(true)
    expect(m.mid.deep.yUsed).toBe(false) // y reachable only via m.mid.deep, never read
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
