import { vi } from 'vitest'
import * as subject from '../../subject.mjs'
vi.mock('../../subject.mjs', () => ({ value: 2, token: {} }))
globalThis.secondSetupGeneration = subject
