import { test, expect, vi } from 'vitest'
const subject = { method: () => 1 }
test('spy persists until explicit restoration', () => {
  vi.spyOn(subject, 'method').mockReturnValue(42)
  expect(subject.method()).toBe(42)
})
test('next case has same spy with cleared calls', () => {
  expect(vi.isMockFunction(subject.method)).toBe(true)
  expect(subject.method).not.toHaveBeenCalled()
  expect(subject.method()).toBe(42)
  vi.restoreAllMocks()
  expect(subject.method()).toBe(1)
})
