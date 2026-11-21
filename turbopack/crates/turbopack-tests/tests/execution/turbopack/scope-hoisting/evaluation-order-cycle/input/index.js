import './setup.js'
import { n } from './n.js'
import './x.js'
import { q } from './q.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when a shared module is part of a cycle', () => {
  expect(order).toEqual(['d', 'n', 'x', 'f', 'e', 'q'])
  expect(n.v + q.v).toBe('dnefq')

  expect(require('./r.js').r.v).toBe('def')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['r'])
})
