import { test, afterAll, onTestFinished, onTestFailed } from 'vitest'
const trace = []
const extended = test.extend({
  // eslint-disable-next-line no-empty-pattern -- Fixture declares no dependencies.
  value: async ({}, provide) => {
    trace.push('fixture setup')
    await provide(42)
    trace.push('fixture cleanup')
  },
})
extended.fails('first failure is success', { retry: 2 }, ({ value }) => {
  trace.push('first body ' + value)
  onTestFinished(() => trace.push('first finished'))
  onTestFailed(() => trace.push('first failed'))
  throw new Error('expected failure')
})
let attempts = 0
test.fails('unexpected pass retries', { retry: 1 }, () => {
  trace.push('recover body ' + ++attempts)
  onTestFinished(() => trace.push('recover finished'))
  onTestFailed(() => trace.push('recover failed'))
  if (attempts > 1) throw new Error('expected failure after retry')
})
test.fails('unexpected passes exhaust retries', { retry: 1 }, () => {
  trace.push('unexpected body')
  onTestFailed(() => trace.push('unexpected failed'))
})
test.fails(
  'repeats stop retry on expected failure',
  { retry: 2, repeats: 1 },
  () => {
    trace.push('repeat body')
    throw new Error('expected repeated failure')
  }
)
afterAll(() => console.log('FAILS_TRACE=' + JSON.stringify(trace)))
