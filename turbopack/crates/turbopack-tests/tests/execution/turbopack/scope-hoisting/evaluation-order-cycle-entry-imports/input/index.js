import './setup.js'

it('should evaluate modules in import order when an entry is part of a cycle of imports', async () => {
  // `page.js` is loaded while `peer.js`, which it imports, is being evaluated.
  const { other } = await import('./other.js')
  expect(globalThis.evaluationOrder).toEqual([
    'shared1',
    'shared2',
    'page',
    'peer',
    'other',
  ])
  expect(other.v()).toBe('shared1 shared2 peer page')

  const { page } = await import('./page.js')
  expect(page.v()).toBe('shared1 shared2 peer page')
  expect(globalThis.evaluationOrder.slice(5)).toEqual([])
})
