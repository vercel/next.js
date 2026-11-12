import { test, expectTypeOf } from 'vitest'
test('type mismatch is a failed test', () => {
  expectTypeOf<string>().toEqualTypeOf<number>()
})
