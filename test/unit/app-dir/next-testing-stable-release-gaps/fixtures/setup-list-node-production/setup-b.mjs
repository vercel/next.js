import { expect } from 'vitest'
expect(globalThis.releaseSetupTrace).toEqual(['a:start', 'a:end'])
globalThis.releaseSetupTrace.push('b:start')
await Promise.resolve()
globalThis.releaseSetupTrace.push('b:end')
