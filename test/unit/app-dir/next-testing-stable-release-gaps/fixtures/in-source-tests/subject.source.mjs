export const value = 42
if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest
  test('in-source body', () => expect(value).toBe(42))
}
