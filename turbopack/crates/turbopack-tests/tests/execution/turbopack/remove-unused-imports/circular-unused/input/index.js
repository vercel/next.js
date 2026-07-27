import { a } from './a'
import { b } from './b'

it('should remove circular dependencies when neither is used', () => {
  // Neither a nor b are actually used
  expect(globalThis.aBundled).toBeUndefined()
  expect(globalThis.bBundled).toBeUndefined()
})
