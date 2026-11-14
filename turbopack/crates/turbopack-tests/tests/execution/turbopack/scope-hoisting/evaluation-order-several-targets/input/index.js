import './setup.js'
import { a } from './a.js'
import './x.js'
import { b } from './b.js'
import { c } from './c.js'
import './y.js'
import { f } from './f.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when several required modules share them', () => {
  expect(order).toEqual(['d1', 'a', 'x', 'd2', 'b', 'e1', 'c', 'y', 'e2', 'f'])
  expect(a.v + b.v + c.v + f.v).toBe('d1d2e1e2')

  expect(require('./r2.js').r2.v).toBe('d1d2')
  expect(require('./r1.js').r1.v).toBe('d1d2e1e2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['r2', 'r1'])
})
