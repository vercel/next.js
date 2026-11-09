import './setup.js'
import { s1 } from './s1.js'
import commonjs from './library/commonjs.js'
import { s2 } from './s2.js'

const order = [...globalThis.deferEvents]

function read() {
  return commonjs.v
}

// The twin of `commonjs-between` with the option off: the same order.

it('evaluates a CommonJS module that is only read in a function where it is imported', async () => {
  expect(order).toEqual(['s1', 'commonjs-dependency', 'commonjs', 's2'])
  expect(s1.v + s2.v + read()).toBe('s1s2commonjs')

  const { other } = await import('./other.js')
  expect(other.v).toBe('s1s2')
  expect(globalThis.deferEvents.slice(order.length)).toEqual(['other'])
})
