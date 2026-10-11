import { vi } from 'vitest'
const value = 'captured'
vi.mock('../dependency', () => ({ value }))
