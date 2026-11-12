globalThis.releaseSetupTrace = ['a:start']
await Promise.resolve()
globalThis.releaseSetupTrace.push('a:end')
