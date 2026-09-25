// `a` resolves through the merged `r.js` to `x.js`'s `b`, while `x.a` reads `x.js`'s
// own `a`. Both are read from the namespace of `x.js`, and must not end up sharing one
// captured binding.
import { a } from './r.js'
import * as x from './x.js'

it('keeps re-exported and namespace bindings of the same name apart', async () => {
  expect(a).toBe('b')
  expect(x.a).toBe('a')
  // Also loading `x.js` from another chunk group keeps it out of the merged group.
  expect((await import('./x.js')).a).toBe('a')
})
