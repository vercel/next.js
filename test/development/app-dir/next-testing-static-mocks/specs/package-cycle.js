import { vi } from 'vitest'
vi.mock('../package-cycle-target', async (importOriginal) => ({
  ...(await importOriginal()),
  value: 'mock',
}))
