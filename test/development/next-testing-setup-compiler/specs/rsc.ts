import { it, expect } from 'vitest'
import { order } from '../setup/state'
if (order.at(-1) !== 'rsc') throw new Error('RSC setup did not run')
it('RSC setup preserves server context', () => {
  expect(order).toEqual([
    'configured-alias',
    'configured-loader',
    'first',
    'second',
    'rsc',
    'hook',
  ])
})
