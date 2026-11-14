import './setup.js'
import { n } from './n.js'
import './x.js'
import { q } from './q.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when a nested function requires a module that shares them', async () => {
  expect(order).toEqual(['d', 'n', 'x', 'd2', 'q'])
  expect(n.v + q.v).toBe('dnd2q')

  class Loader {
    load() {
      const inner = () => {
        function innermost() {
          return require('./r.js')
        }
        return innermost()
      }
      return inner()
    }
  }
  const { r } = new Loader().load()
  expect(r.v).toBe('dd2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['r'])
})
