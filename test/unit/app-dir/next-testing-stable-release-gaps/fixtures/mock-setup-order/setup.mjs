import { vi } from 'vitest'
vi.mock('./subject.mjs', () => ({ value: 42 }))
