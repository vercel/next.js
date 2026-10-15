import { test, expect } from 'vitest'
import { value } from '@release-subject'
test('Vite alias is mapped or specifically diagnosed', () =>
  expect(value).toBe(42))
