import {
  describe,
  test,
  expect,
  afterEach,
  beforeEach,
  onTestFinished,
  onTestFailed,
  afterAll,
} from 'vitest'
const trace = []
const record = (name) => trace.push(name)
describe('teardown adds an assertion', () => {
  afterEach(() => {
    record('extra teardown')
    expect(true).toBe(true)
  })
  test('one body assertion', () => {
    expect.assertions(1)
    expect(true).toBe(true)
  })
  test('missing second body assertion', () => {
    expect.assertions(2)
    expect(true).toBe(true)
    onTestFailed(() => record('count failure'))
  })
  test('has assertions only in cleanup', () => {
    expect.hasAssertions()
  })
})
describe('finished listener', () => {
  test('body owns count', () => {
    expect.assertions(1)
    expect(true).toBe(true)
    onTestFinished(() => {
      record('finished')
      expect(true).toBe(true)
    })
  })
  test('listener cannot satisfy count', () => {
    expect.assertions(1)
    onTestFinished(() => {
      record('missing finished')
      expect(true).toBe(true)
    })
  })
})
describe('body already failed', () => {
  test('count does not add another failure', () => {
    expect.assertions(1)
    throw new Error('original body failure')
  })
})
describe('matcher failures', () => {
  test('soft failure retains missing count', () => {
    expect.assertions(2)
    expect.soft(1).toBe(2)
    onTestFailed(() => record('soft failed'))
  })
  test('awaited rejection retains original failure without another count error', async () => {
    expect.assertions(2)
    await expect(Promise.resolve(1)).resolves.toBe(2)
  })
})
describe('cleanup declares count', () => {
  afterEach(() => {
    record('late count')
    expect.assertions(20)
  })
  test('count declared too late', () => {
    expect(true).toBe(true)
  })
})
describe('setup owns assertions', () => {
  beforeEach(() => {
    record('setup')
    expect(true).toBe(true)
  })
  afterEach(() => {
    record('setup teardown')
    expect(true).toBe(true)
  })
  test('setup and body count before teardown', () => {
    expect.assertions(2)
    expect(true).toBe(true)
  })
})
describe('retry owns count', () => {
  let attempts = 0
  afterEach(() => {
    record('retry teardown')
    expect(true).toBe(true)
  })
  test('retry', { retry: 1 }, () => {
    expect.assertions(1)
    if (++attempts > 1) expect(true).toBe(true)
  })
})
afterAll(() => console.log('COUNT_TRACE=' + JSON.stringify(trace)))
