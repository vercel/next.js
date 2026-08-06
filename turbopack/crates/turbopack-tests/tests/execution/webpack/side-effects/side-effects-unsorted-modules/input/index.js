import { b } from 'dep'

b.c()

import { modules } from 'dep/trackModules.js'

it('should not contain side-effect-free modules', () => {
  // TODO: webpack can trim 'b'. The issue is that turbopack cannot follow namespace re-exports
  // when it is tree shaking exports.
  expect(modules).toEqual(['b', 'c'])
})
