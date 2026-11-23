import { fromArrow } from './lib.js'

it('reads an export assigned through `this` in a top-level arrow', () => {
  expect(fromArrow).toBe('arrow-value')
})
