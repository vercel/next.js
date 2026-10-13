import {
  assert,
  assertType,
  expectTypeOf,
  vi,
} from 'next/experimental/testing/vitest'
assertType<number>(42)
expectTypeOf(42).toEqualTypeOf<number>()
assert.strictEqual('portable', 'portable')
const mock = vi.fn((value: number) => `${value}`)
expectTypeOf(mock(42)).toEqualTypeOf<string>()
// @ts-expect-error The value must satisfy the explicitly selected type.
assertType<string>(42)
// @ts-expect-error Incorrect type equality must remain an editor/compiler error.
expectTypeOf(42).toEqualTypeOf<string>()
// @ts-expect-error Typed mocks preserve their parameter types.
mock('invalid')
