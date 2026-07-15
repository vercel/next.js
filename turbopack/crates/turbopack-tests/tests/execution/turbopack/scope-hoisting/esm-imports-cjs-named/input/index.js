// Only named imports — no namespace object and no default import. This is the
// case that should be able to bind straight to the CommonJS module's per-export
// locals instead of materializing an exports object.
import { a, b } from './cjs'

it('scope-hoists named imports from a static CJS module', () => {
  expect(a).toBe(1)
  expect(b).toBe(2)
})
