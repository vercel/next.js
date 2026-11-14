import './setup.js'
import { y1 } from './y1.js'
import './between.js'
import { y2 } from './y2.js'

const order = [...globalThis.evaluationOrder]

it('should let a module import a module that it is not merged with because of the evaluation order', async () => {
  expect(order).toEqual(['x', 'y1', 'between', 'y2'])
  expect(y1.v + y2.v).toBe('xy1xy2')

  const { other } = await import('./other.js')
  expect(other.v).toBe('xy1xy2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['other'])
})
