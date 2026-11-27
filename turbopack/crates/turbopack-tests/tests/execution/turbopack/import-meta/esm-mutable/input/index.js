import { getFoo } from './mod.mjs'

it('allows mutating import.meta', () => {
  expect(getFoo()).toBe(1)
})
