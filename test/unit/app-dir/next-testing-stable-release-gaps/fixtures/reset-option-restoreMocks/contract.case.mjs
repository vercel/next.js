import { test, expect, vi } from 'vitest'
const subject = { method: () => 42 }
test('changes implementation', () => {
  vi.spyOn(subject, 'method').mockImplementation(() => 99)
  expect(subject.method()).toBe(99)
})
test('automatic reset before next case', () => {
  expect(subject.method()).toBe(42)
  expect(vi.isMockFunction(subject.method)).toBe(false)
})
