import { test, expect } from 'vitest'
let attempts = 0
test('global retries apply to cases', () => expect(++attempts).toBe(2))
