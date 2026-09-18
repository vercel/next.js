import { vi } from 'vitest'
vi.mock('../dependency', () => ({ value: 'mock' }))
