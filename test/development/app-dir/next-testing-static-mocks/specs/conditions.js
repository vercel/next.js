import { test, expect, vi } from 'vitest'
import { condition } from '../conditions/node-development'
vi.mock('next-testing-static-mocks-fixture', () => ({
  condition: 'mock node condition',
}))
test('package conditions identify the same target as its resolved local import', () => {
  expect(condition).toBe('mock node condition')
})
