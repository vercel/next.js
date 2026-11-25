import { loadInner } from './x/index'
import { loadMiddle } from './y/index'
import { hasModuleFactory } from '../../../__helpers__/module-factories.js'

it('shares a merged module between async chunks', async () => {
  const { x } = await loadInner()
  const { y } = await loadMiddle()
  expect(x).toBeGreaterThan(1000)
  expect(y).toBe(x)
})

it('merges modules only within the same chunk', async () => {
  await loadInner()
  await loadMiddle()
  // `big/other.js` is only used by `big/index.js`, `y/inner.js` only by
  // `y/middle.js`.
  expect(hasModuleFactory('big/other.js')).toBe(false)
  expect(hasModuleFactory('y/inner.js')).toBe(false)
  // `big/index.js` is shared by the `x` and `y` async chunks, so it can't be
  // merged into either of them.
  expect(hasModuleFactory('big/index.js')).toBe(true)
  expect(hasModuleFactory('x/inner.js')).toBe(true)
  expect(hasModuleFactory('y/middle.js')).toBe(true)
})
