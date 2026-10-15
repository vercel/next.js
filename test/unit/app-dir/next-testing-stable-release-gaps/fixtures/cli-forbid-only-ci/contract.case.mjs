import { test, expect } from 'vitest'
test.only('CI cannot silently focus away cases', () => expect(42).toBe(42))
test('unfocused', () => {})
