import { b } from 'dep'

b.c()

import { modules } from 'dep/trackModules.js'

it('should not contain side-effect-free modules', () => {
  expect(modules).toEqual(['c'])
})
