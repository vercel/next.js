import './c.js'

it('evaluates merged modules importing the same module in order', () => {
  expect(globalThis.duplicateImportsLog).toEqual([
    ['a', 'shared'],
    ['b', 'shared'],
    ['c', 'shared'],
  ])
})

it('requires a module imported by several merged modules only once', () => {
  const ids = Array.from(__turbopack_modules__.keys())
  // `a.js`, `b.js` and `c.js` are merged into this module.
  for (const file of ['a.js', 'b.js', 'c.js']) {
    expect(ids.some((id) => id.includes(`/input/${file} `))).toBe(false)
  }

  const index = ids.filter((id) =>
    id.endsWith('/input/index.js [test] (ecmascript)')
  )
  expect(index).toHaveLength(1)
  const code = __turbopack_modules__.get(index[0]).toString()
  expect(code.match(/\.i\("[^"]*\/input\/shared\.js /g)).toHaveLength(1)
})
