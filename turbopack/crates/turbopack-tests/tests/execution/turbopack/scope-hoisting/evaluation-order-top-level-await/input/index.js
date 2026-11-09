import './setup.js'

it('should not merge a module with top-level await with the modules around it', async () => {
  const { entry } = await import('./entry.js')
  expect(globalThis.evaluationOrder).toEqual([
    'a',
    'b before await',
    'c',
    'b after await',
    'entry',
  ])
  expect(entry.v).toBe('abc')
})
