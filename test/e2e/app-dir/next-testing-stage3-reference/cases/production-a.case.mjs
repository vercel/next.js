import { expect, it } from 'vitest'
import { condition } from 'next-testing-stage3-conditions'
import { productionValue } from '../lib/profile'
import { state } from '../lib/state'
if (state.setup.join(',') !== 'first-start,first-end,second')
  throw new Error('Setup did not finish before spec evaluation')
it('uses production conditions and completed setup in file A', () => {
  expect(process.env.NODE_ENV).toBe('production')
  expect(condition).toBe('production')
  expect(productionValue()).toBe('L3_PRODUCTION_BRANCH')
  expect(state.cases++).toBe(0)
})
