import './setup.js'
import { s1 } from './s1.js'
import commonjs from './commonjs.js'
import { s2 } from './s2.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate a CommonJS module between two modules that another chunk group imports too', async () => {
  expect(order).toEqual(['s1', 'commonjs', 's2'])
  expect(s1.v + commonjs.v + s2.v).toBe('s1commonjss2')

  const { other } = await import('./other.js')
  expect(other.v).toBe('s1s2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['other'])
})
