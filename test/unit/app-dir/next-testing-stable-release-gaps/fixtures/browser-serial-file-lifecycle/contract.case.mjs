import {
  test,
  describe,
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
  trace.push('file+')
  await pause()
  await run()
  await pause()
  trace.push('file-')
  expect(trace).toEqual([
    'file+', 'setup',
    'case+', 'before', 'first', 'after', 'case-',
    'nested+',
    'case+', 'before', 'second', 'after', 'case-',
    'case+', 'before', 'third', 'after', 'case-',
    'case+', 'before', 'pending', 'after', 'case-',
    'nested-',
    'case+', 'before', 'last', 'after', 'case-',
    'teardown', 'file-',
  ])
})
beforeAll(async () => {
  await pause()
  expect(typeof document).toBe('object')
  trace.push('setup')
})
afterAll(async () => {
  await pause()
  trace.push('teardown')
})
aroundEach(async (run) => {
  trace.push('case+')
  await pause()
  await run()
  await pause()
  trace.push('case-')
})
beforeEach(async () => {
  await pause()
  expect(trace).toContain('setup')
  trace.push('before')
})
afterEach(async () => {
  await pause()
  trace.push('after')
})
test('first', async () => {
  await pause()
  expect(trace).toEqual(['file+', 'setup', 'case+', 'before'])
  trace.push('first')
})
describe('nested > literal', () => {
  beforeAll(async () => {
    await pause()
    trace.push('nested+')
  })
  afterAll(async () => {
    await pause()
    expect(trace).toContain('third')
    trace.push('nested-')
  })
  test('same', async () => {
    await pause()
    expect(trace).toContain('first')
    trace.push('second')
  })
  test.skip('explicit skip', () => {
    throw new Error('explicit skip body must not execute')
  })
  test.todo('todo')
  test('same', async () => {
    await pause()
    expect(trace).toContain('second')
    trace.push('third')
  })
  test('pending', ({ skip }) => {
    trace.push('pending')
    skip('conditional browser skip')
    throw new Error('pending body must stop at skip')
  })
})
test('last', async () => {
  await pause()
  expect(trace).toContain('nested-')
  trace.push('last')
})
test('filtered', () => {
  throw new Error('filtered body must not execute')
})
