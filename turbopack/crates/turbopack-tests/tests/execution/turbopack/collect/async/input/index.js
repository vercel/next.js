import './lib'

it('should collect from a dynamically imported module', async () => {
  // The collecting module is in an async chunk group, so the loader for it has to keep the
  // entry group of this entry.
  const { getList } = await import('./collector')
  const list = getList()
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/async/input/a.js [test] (ecmascript)',
      data: 'data-for-a',
    }),
  ])
  expect((await list[0].import()).a()).toEqual('this is a.js')
})

it('should load a dynamically imported module without a collecting module', async () => {
  const { plain } = await import('./plain')
  expect(plain()).toEqual('this is plain.js')
})
