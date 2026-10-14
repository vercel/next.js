import { expect, afterAll } from 'vitest'
import { state } from '../lib/state'
if (state.setup.length !== 0) throw new Error('Setup state leaked across files')
if (state.cases !== 0) throw new Error('Case state leaked across files')
state.setup.push('first-start')
await Promise.resolve()
state.setup.push('first-end')
afterAll(() => {
  expect(state.cases).toBe(1)
})
