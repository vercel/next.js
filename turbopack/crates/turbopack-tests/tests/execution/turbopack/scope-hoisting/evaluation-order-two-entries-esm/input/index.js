import './setup.js'
import './a1.js'
import { s1 } from './s1.js'
import './a2.js'
import { s2 } from './s2.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate an ES module between two modules that another chunk group imports too', async () => {
  expect(order).toEqual(['a1', 's1', 'a2', 's2'])
  expect(s1.v + s2.v).toBe('s1s2')

  const { other } = await import('./other.js')
  expect(other.v).toBe('s1s2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['other'])
})
