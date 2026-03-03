import './lib'

import list from '@turbopack/collect' with { turbopackCollect: 'my-test' }

it('should work', async () => {
  expect(list).toEqual([
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/a.js [test] (ecmascript)',
      data: 'TODO DATA',
    }),
    expect.objectContaining({
      id: '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/collect/basic/input/b.js [test] (ecmascript)',
      data: 'TODO DATA',
    }),
  ])

  expect((await list[0].import()).a()).toEqual('this is a.js')
  expect((await list[1].import()).b()).toEqual('this is b.js')
})
