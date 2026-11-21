import './setup.js'
import { a } from './a.js'
import { b } from './b.js'

const order = [...globalThis.evaluationOrder]

// `m` and `n` are loaded while `a` and `b` are evaluated, and both are on one import cycle:
// `commonjs-a` and `commonjs-b` reference each other. Neither `x`, `y`, `a` nor `p`, `q`, `b` may
// be merged.
it('should evaluate modules in import order when two modules of one cycle are loaded again while they are evaluated', () => {
  expect(order).toEqual([
    'x',
    'y',
    'z',
    'm',
    'commonjs-a',
    'a',
    'p',
    'q',
    'r',
    'n',
    'commonjs-b',
    'b',
  ])
  expect(a.v + b.v).toBe('xypq')
  expect(globalThis.seenByZ + globalThis.seenByR).toBe('yq')
})
