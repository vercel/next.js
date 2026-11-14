import './setup.js'
import { load } from './a.js'
import { n } from './n.js'
import './x.js'
import { q } from './q.js'

const order = [...globalThis.evaluationOrder]

it('should evaluate modules in import order when a module that is imported before them requires another importer of them later', () => {
  expect(order).toEqual(['a', 'd', 'n', 'x', 'd2', 'q'])
  expect(n.v + q.v).toBe('dnd2q')

  const { r } = load()
  expect(r.v).toBe('dd2')
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual(['r'])
})
