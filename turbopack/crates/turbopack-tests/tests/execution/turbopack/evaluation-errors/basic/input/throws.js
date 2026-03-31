globalThis.evalCounter ??= 0
globalThis.evalCounter++

throw new Error('uh oh')
