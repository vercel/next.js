import { vi } from 'vitest'
import * as subject from '../subject.mjs'
vi.mock('../subject.mjs', () => ({ value: 1, token: {} }))
globalThis.firstSetupGeneration = subject
