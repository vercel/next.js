import './setup.js'
import { n } from './n.js'
import './x.js'
import { q } from './q.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when they are imported through re-exports', () => {
  expect(order).toEqual(['d', 'names', 'n', 'x', 'd2', 'star', 'q'])
  expect(n.v + q.v).toBe('dnd2q')

  expect(require('./r.js').r.v).toBe('dd2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['r'])
})
