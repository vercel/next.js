it('module evaluation that overflows the stack is evaluated again on the next import', async () => {
  expect(globalThis.overflowEvalCounter).toBeUndefined()
  const error = await importError()
  expect(error).toBeInstanceOf(RangeError)
  expect(globalThis.overflowEvalCounter).toBe(1)

  // The overflow depended on the stack at the time, not on the module, so
  // unlike other errors it is not remembered.
  const { default: value } = await import('./overflows')
  expect(value).toBe('evaluated')
  expect(globalThis.overflowEvalCounter).toBe(2)

  // Once evaluated, the module is cached as usual.
  await import('./overflows')
  expect(globalThis.overflowEvalCounter).toBe(2)
})

it('require of a module that overflows the stack evaluates it again', () => {
  expect(globalThis.overflowRequireCounter).toBeUndefined()
  expect(() => require('./overflows-require')).toThrow(RangeError)
  expect(globalThis.overflowRequireCounter).toBe(1)
  expect(require('./overflows-require')).toBe('evaluated')
  expect(globalThis.overflowRequireCounter).toBe(2)
})

it('importers of a module that overflows the stack are evaluated again too', async () => {
  expect(globalThis.chainEvaluated).toBeUndefined()
  let error
  try {
    await import('./chain-a')
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(RangeError)
  // Only the module that overflowed ran; its importers failed before their own code.
  expect(globalThis.chainEvaluated.join()).toBe('c')

  const { default: value } = await import('./chain-a')
  expect(value).toBe('a')
  expect(globalThis.chainEvaluated.join()).toBe('c,c,b,a')
})

async function importError() {
  try {
    await import('./overflows')
  } catch (e) {
    return e
  }
  throw new Error('should have thrown')
}
