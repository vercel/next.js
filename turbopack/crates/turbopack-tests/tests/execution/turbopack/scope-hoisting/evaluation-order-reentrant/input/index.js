import './setup.js'
import { a } from './a.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when a module is loaded again while it is evaluated', () => {
  expect(order).toEqual(['x', 'y', 'z', 'm', 'commonjs', 'a'])
  expect(a.v).toBe('xy')
  expect(globalThis.seenByZ).toBe('y')
})
