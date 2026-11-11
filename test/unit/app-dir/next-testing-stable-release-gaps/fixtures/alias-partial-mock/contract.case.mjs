import { test, expect, vi } from 'vitest'
import { value } from '#release-subject'
vi.mock('#release-subject', async (original) => ({
  ...(await original()),
  value: 42,
}))
test('package imports alias retains mock target', () => expect(value).toBe(42))
