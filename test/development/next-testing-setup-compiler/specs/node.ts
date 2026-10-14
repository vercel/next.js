import { it, expect } from 'vitest'
import { order } from '../setup/state'
if (order.join(',') !== 'configured-alias,configured-loader,first,second')
  throw new Error('spec ran before setup')
it('ordered setup shares runner and imports', () => {
  expect(order).toEqual([
    'configured-alias',
    'configured-loader',
    'first',
    'second',
    'hook',
  ])
})
