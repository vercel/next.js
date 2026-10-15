import { test, expect, vi } from 'vitest'
import { basename } from 'pathe'
vi.mock('pathe', async (original) => ({
  ...(await original()),
  basename: vi.fn(() => 'mocked'),
}))
test('external ESM package partial factory remains mockable', () =>
  expect(basename('/a/b')).toBe('mocked'))
