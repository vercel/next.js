import * as source from './x'
import { moduleIds } from '../../../__helpers__/module-factories.js'

it('re-exports from a module that is scope hoisted into the importer', async () => {
  // `x.js` is merged into this module, but is also re-exported by the
  // dynamically imported `reexports.js`.
  expect({ ...source }).toEqual({ x: 'x' })

  const namespace = await import('./reexports')
  expect({ ...namespace }).toEqual({ x: 'x' })
  expect(namespace.x).toBe(source.x)
})

it('merges the facade of the shared module into the importer', async () => {
  await import('./reexports')
  // The facade of `x.js` is merged into this module. Its locals are shared with the dynamically
  // imported `reexports.js`, which lives in another chunk, so they keep a factory of their own.
  expect(moduleIds('x.js')).toEqual([expect.stringMatching(/ <locals>$/)])
  expect(moduleIds('reexports.js')).toEqual([
    expect.stringMatching(/\/input\/reexports\.js \[test\] \(ecmascript\)$/),
  ])
  expect(moduleIds('index.js')).toEqual([
    expect.stringMatching(/\/input\/index\.js \[test\] \(ecmascript\)$/),
  ])
})
