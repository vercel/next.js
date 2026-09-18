import { vi } from 'vitest'
vi.mock('../dependency?raw', () => ({ value: 'mock' }))
