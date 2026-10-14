import { expect, it } from 'vitest'
import { productionValue } from '../lib/profile'
import { state } from '../lib/state'
if (state.setup.join(',') !== 'first-start,first-end,second')
  throw new Error('Setup did not finish before spec evaluation')
it('has a fresh evaluation realm in file B', () => {
  expect(productionValue()).toBe('L3_PRODUCTION_BRANCH')
  expect(state.cases++).toBe(0)
})
