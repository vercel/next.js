import { leak } from './lib.js'

it('keeps an export that is read through `this` in a top-level arrow', () => {
  // If `exports.viaThis` were dropped, this would be `undefined`.
  expect(leak()).toBe('V')
})
