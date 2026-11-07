import { loadInner } from './x/index'
import { loadMiddle } from './y/index'

function hasOwnFactory(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.includes(`/input/${file} [test] (ecmascript)`)
  )
}

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
  expect(hasOwnFactory('big/other.js')).toBe(false)
  expect(hasOwnFactory('y/inner.js')).toBe(false)
  // `big/index.js` is shared by the `x` and `y` async chunks, so it can't be
  // merged into either of them.
  expect(hasOwnFactory('big/index.js')).toBe(true)
  expect(hasOwnFactory('x/inner.js')).toBe(true)
  expect(hasOwnFactory('y/middle.js')).toBe(true)
})
