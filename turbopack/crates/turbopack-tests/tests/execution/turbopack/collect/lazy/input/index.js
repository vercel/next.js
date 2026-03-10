import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

it('should work', async () => {
  const list = getList()
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/lazy/input/a.js [test] (ecmascript)',
      data: undefined,
    }),
  ])

  expect((await list[0].import()).a()).toEqual('this is a.js')
})
