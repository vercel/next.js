import { vi } from 'vitest'
vi.mock('../dependency', () => ({ value: 'mock' }))
import { value } from '@raw'
console.log(value)
