import { vi } from 'vitest'
import * as subject from '../../b.mjs'
import { meet } from '../../barrier.mjs'
vi.mock('../../b.mjs', () => ({ value: 2 }))
globalThis.secondParallelNamespace = subject
globalThis.secondParallelArrivals = await meet('second')
