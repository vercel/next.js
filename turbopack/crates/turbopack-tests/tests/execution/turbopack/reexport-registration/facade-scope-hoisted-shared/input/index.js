import * as source from './x'

it('re-exports from a module that is scope hoisted into the importer', async () => {
  // `x.js` is merged into this module, but is also re-exported by the
  // dynamically imported `reexports.js`.
  expect({ ...source }).toEqual({ x: 'x' })

  const namespace = await import('./reexports')
  expect({ ...namespace }).toEqual({ x: 'x' })
  expect(namespace.x).toBe(source.x)
})
