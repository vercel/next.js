import { test, expect } from 'vitest'
import { value } from './subject.mjs'
test('setup registration precedes test module evaluation', () =>
  expect(value).toBe(42))
