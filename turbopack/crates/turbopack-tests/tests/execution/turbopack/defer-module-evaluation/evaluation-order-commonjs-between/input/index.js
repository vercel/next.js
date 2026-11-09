import './setup.js'
import { s1 } from './s1.js'
import commonjs from './library/commonjs.js'
import { s2 } from './s2.js'

const order = [...globalThis.deferEvents]

// `scope-hoisting/evaluation-order-commonjs-between` with the CommonJS module in a package that is
// declared side effect free. The module is only read in a function, but the import of a CommonJS
// module is not deferred: it is evaluated where it is imported.

it('evaluates a CommonJS module of a side effect free package between two modules that another chunk group imports too', async () => {
  expect(order).toEqual(['s1', 'commonjs', 's2'])
  expect(s1.v + commonjs.v + s2.v).toBe('s1commonjss2')

  const { other } = await import('./other.js')
  expect(other.v).toBe('s1s2')
  expect(globalThis.deferEvents.slice(order.length)).toEqual(['other'])
})
