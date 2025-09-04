it('module evaluation rethrows but does not re-evaluate', async () => {
  expect(globalThis.evalCounter).toBeUndefined()
  await assertThrowsThrows()
  expect(globalThis.evalCounter).toBe(1)
  await assertThrowsThrows()
  expect(globalThis.evalCounter).toBe(1)
})

async function assertThrowsThrows() {
  try {
    await import('./throws')
  } catch (e) {
    return e
  }
  throw new Error('should have thrown')
}
