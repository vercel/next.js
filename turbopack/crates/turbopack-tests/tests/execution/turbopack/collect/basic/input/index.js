import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

it('should work', async () => {
  const list = getList()
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/a.js [test] (ecmascript)',
      data: 'data-for-a',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/b.js [test] (ecmascript)',
      data: 'data-for-b',
    }),
  ])

  expect((await list[0].import()).a()).toEqual('this is a.js')
  expect((await list[1].import()).b()).toEqual('this is b.js')
})
