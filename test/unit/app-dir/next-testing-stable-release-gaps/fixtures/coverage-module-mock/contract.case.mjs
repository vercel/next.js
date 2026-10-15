import { test, expect, vi } from 'vitest'
import { choose } from './subject.mjs'
vi.mock('./subject.mjs', () => ({
  choose: () => 'mocked',
  unused: () => 'unused',
}))
test('mock does not execute original branches', () =>
  expect(choose(true)).toBe('mocked'))
