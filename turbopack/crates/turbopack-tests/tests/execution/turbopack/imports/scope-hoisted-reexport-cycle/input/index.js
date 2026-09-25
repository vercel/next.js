// `r.js` is evaluated first, so the cycle `r.js -> a.js -> r.js` runs `a.js` before
// `r.js` has imported `x.js`.
import { readB } from './r.js'

it('reads a binding re-exported by a module that has not run yet', async () => {
  expect(readB()).toBe(1)
  // Also loading `x.js` from another chunk group keeps it out of the merged group, so
  // `a.js` reads it through the namespace that `r.js` imports.
  expect((await import('./x.js')).b).toBe(1)
})
