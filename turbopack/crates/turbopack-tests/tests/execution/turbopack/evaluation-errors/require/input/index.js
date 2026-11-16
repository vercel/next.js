it('require evaluates a module again after it threw, like Node.js', () => {
  expect(globalThis.throwsOnceCounter).toBeUndefined()
  expect(() => require('./throws-once')).toThrow('first evaluation')
  expect(globalThis.throwsOnceCounter).toBe(1)

  expect(require('./throws-once')).toBe('evaluated')
  expect(globalThis.throwsOnceCounter).toBe(2)

  // Once evaluated, the module is cached as usual.
  require('./throws-once')
  expect(globalThis.throwsOnceCounter).toBe(2)
})

it('require of a module whose imports overflow the stack recovers on the next require', () => {
  expect(globalThis.chainEvaluated).toBeUndefined()
  expect(() => require('./chain-a')).toThrow(RangeError)
  // Only the module that overflowed ran; its importers failed before their own code.
  expect(globalThis.chainEvaluated.join()).toBe('c')

  // Every module that failed in that require is evaluated again.
  expect(require('./chain-a').default).toBe('a')
  expect(globalThis.chainEvaluated.join()).toBe('c,c,b,a')
})

it('import keeps the evaluation error, as ESM requires', async () => {
  expect(globalThis.importOverflowCounter).toBeUndefined()
  const first = await importError()
  expect(first).toBeInstanceOf(RangeError)
  const second = await importError()
  expect(second).toBe(first)
  expect(globalThis.importOverflowCounter).toBe(1)
})

async function importError() {
  try {
    await import('./import-overflows')
  } catch (e) {
    return e
  }
  throw new Error('should have thrown')
}
