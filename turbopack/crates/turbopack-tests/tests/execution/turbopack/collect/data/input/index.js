import './lib'

const getList = __turbopack_collect__({
  namespace: 'my-test',
})

it('should work', async () => {
  const list = [...getList()]
  list.sort((a, b) => String(a.data).localeCompare(String(b.data)))
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/data/input/a.js [test] (ecmascript)',
      data: { foo: 1, bar: 'baz' },
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/data/input/a.js [test] (ecmascript)',
      data: 'data-for-a',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/data/input/a.js [test] (ecmascript)',
      data: ['foo', 123, true, null],
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/data/input/a.js [test] (ecmascript)',
      data: undefined,
    }),
  ])

  for (const item of list) {
    expect((await item.import()).a()).toEqual('this is a.js')
  }
})
