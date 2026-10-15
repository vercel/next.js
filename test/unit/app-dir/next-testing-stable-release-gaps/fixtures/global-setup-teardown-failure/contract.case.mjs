import { test, expect } from 'vitest'
test('body still reported before teardown fails', () => expect(42).toBe(42))
