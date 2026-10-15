const { writeFileSync } = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
exports.testRunner =
  paths.mode === 'disposal'
    ? {
        ...runner,
        initializeTestFile(options) {
          const file = runner.initializeTestFile(options)
          return {
            ...file,
            async dispose() {
              await file.dispose()
              Promise.reject(new Error('owned unhandled rejection'))
              await new Promise((resolve) => setImmediate(resolve))
            },
          }
        },
      }
    : runner
exports.loadTestModule = async () => {
  const { test, expect, vi } = require(paths.vitest)
  vi.stubGlobal('__next_rejection_probe', true)
  process.once('exit', () => {
    writeFileSync(
      paths.marker,
      Object.hasOwn(globalThis, '__next_rejection_probe')
        ? 'leaked'
        : 'restored'
    )
  })
  if (paths.mode === 'collection') {
    Promise.reject(new Error('owned unhandled rejection'))
    await new Promise((resolve) => setImmediate(resolve))
  }
  test('completed body retains its result', async () => {
    expect('snapshot remains provisional').toMatchSnapshot()
    if (paths.mode === 'body')
      Promise.reject(new Error('owned unhandled rejection'))
    else if (paths.mode === 'primitive')
      Promise.reject('owned primitive rejection')
    else if (paths.mode === 'caught')
      await Promise.reject(new Error('handled rejection')).catch(() => {})
    await new Promise((resolve) => setImmediate(resolve))
    expect(42).toBe(42)
  })
  test('successor still runs', () => expect(true).toBe(true))
}
