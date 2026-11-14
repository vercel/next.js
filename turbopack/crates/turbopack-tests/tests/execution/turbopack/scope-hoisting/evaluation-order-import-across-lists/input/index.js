import './setup.js'
import { m0 } from './m0.js'
import { m1 } from './m1.js'
import { m3 } from './m3.js'
import { m8 } from './m8.js'
import { m4 } from './m4.js'
import { m5 } from './m5.js'
import { m7 } from './m7.js'

const order = [...globalThis.evaluationOrder]

it('should let a module of a list that is split import a module of another list of the same importers', async () => {
  expect(order).toEqual(['m0', 'm1', 'm3', 'm2', 'm7', 'm8', 'm4', 'm5'])
  expect([m0, m1, m3, m8, m4, m5, m7].map((m) => m.v)).toEqual([
    'm0',
    'm1',
    'm3',
    'm2m7m8',
    'm3m4',
    'm0m5',
    'm2m7',
  ])

  const { other } = await import('./other.js')
  expect(other.v).toEqual([
    'm0',
    'm1',
    'm3',
    'm3m4',
    'm0m3m4m9',
    'm0m5',
    'm0m6',
    'm2m7',
  ])
  expect(globalThis.evaluationOrder.slice(order.length)).toEqual([
    'm9',
    'm6',
    'other',
  ])
})
