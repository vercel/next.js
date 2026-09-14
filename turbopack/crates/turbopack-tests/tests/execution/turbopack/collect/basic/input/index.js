import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

it('should work', async () => {
  const list = getList()
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/b.js [test] (ecmascript)',
      data: 'more-data-for-b',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/c.js [test] (ecmascript)',
      data: 'data-for-c',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/a.js [test] (ecmascript)',
      data: 'data-for-a',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/b.js [test] (ecmascript)',
      data: 'data-for-b',
    }),
  ])

  const [b2, c, a, b1] = list
  expect((await a.import()).a()).toEqual('this is a.js')
  expect((await b1.import()).b()).toEqual('this is b.js')
  expect((await c.import()).c()).toEqual('this is c.js')
  expect(await b1.import()).toBe(await b2.import())

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).not.toContainEqual(expect.stringMatching(/input\/c-unused/))
})
