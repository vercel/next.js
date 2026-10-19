import { vi } from 'vitest'
import * as subject from '../subject.mjs'
import * as counter from '../counter.mjs'
vi.mock('../subject.mjs', () => ({ value: 41, token: {} }))
counter.increment()
globalThis.firstSetupInput = { subject, counter }
