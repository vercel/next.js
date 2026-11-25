import { keep } from './lib.js'

it('keeps a sibling declarator when an unused require shares its declaration', () => {
  expect(keep).toBe('kept')
})
