import {
  test,
  expect,
  aroundAll,
  aroundEach,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
const trace = []
const pause = () => new Promise((resolve) => queueMicrotask(resolve))
aroundAll(async (run) => {
  trace.push('suite+')
  await pause()
  expect(typeof document).toBe('object')
  await run()
  await pause()
  trace.push('suite-')
  expect(trace).toEqual([
    'suite+',
    'setup',
    'case+',
    'before',
    'body',
    'after',
    'case-',
    'teardown',
    'suite-',
  ])
})
beforeAll(async () => {
  await pause()
  expect(typeof window).toBe('object')
  trace.push('setup')
})
aroundEach(async (run) => {
  trace.push('case+')
  await pause()
  await run()
  await pause()
  trace.push('case-')
  expect(trace).toContain('body')
})
beforeEach(async () => {
  await pause()
  expect(trace).toContain('setup')
  trace.push('before')
})
afterEach(async () => {
  await pause()
  expect(trace).toContain('body')
  trace.push('after')
})
afterAll(async () => {
  await pause()
  expect(trace).toContain('case-')
  trace.push('teardown')
})
test('owned async suite and case hooks', async () => {
  await pause()
  expect(trace).toEqual(['suite+', 'setup', 'case+', 'before'])
  trace.push('body')
})
