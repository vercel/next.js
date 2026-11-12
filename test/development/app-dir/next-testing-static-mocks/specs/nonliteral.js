import { vi } from 'vitest'
const target = '../dependency'
vi.mock(target, () => ({ value: 'mock' }))
