import './c.js'
import {
  hasModuleFactory,
  moduleCode,
} from '../../../__helpers__/module-factories.js'

it('evaluates merged modules importing the same module in order', () => {
  expect(globalThis.duplicateImportsLog).toEqual([
    ['a', 'shared'],
    ['b', 'shared'],
    ['c', 'shared'],
  ])
})

it('requires a module imported by several merged modules only once', () => {
  // `a.js`, `b.js` and `c.js` are merged into this module.
  for (const file of ['a.js', 'b.js', 'c.js']) {
    expect(hasModuleFactory(file)).toBe(false)
  }

  const code = moduleCode('index.js')
  expect(code.match(/\.i\("[^"]*\/input\/shared\.js /g)).toHaveLength(1)
})
