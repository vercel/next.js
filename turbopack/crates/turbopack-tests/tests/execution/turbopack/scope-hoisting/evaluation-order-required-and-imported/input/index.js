import './setup.js'
import { n } from './n.js'
import './x.js'
import { m } from './m.js'

const order = [...globalThis.evaluationOrder]

it('should not evaluate a module early that is imported and required', () => {
  expect(order).toEqual(['d', 'n', 'x', 'r', 'm'])
  expect(n.v + m.v).toBe('dndrm')

  expect(require('./r.js').r.v).toBe('dr')
  expect(globalThis.evaluationOrder).toEqual(order)
})
