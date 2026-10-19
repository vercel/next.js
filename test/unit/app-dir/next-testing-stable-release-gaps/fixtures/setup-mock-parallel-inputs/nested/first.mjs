import { vi } from 'vitest'
import * as subject from '../a.mjs'
import { meet } from '../barrier.mjs'
vi.mock('../a.mjs', () => ({ value: 1 }))
globalThis.firstParallelNamespace = subject
globalThis.firstParallelArrivals = await meet('first')
