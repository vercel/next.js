import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  onTestFinished,
  onTestFailed,
} from 'vitest'
const waiting = new Map()
const trace = []
async function meet(phase, name) {
  trace.push(phase + ':' + name + ':start')
  await new Promise((resolve) => {
    const pair = waiting.get(phase) || []
    waiting.set(phase, pair)
    pair.push(resolve)
    if (pair.length === 2) {
      waiting.delete(phase)
      pair.forEach((done) => done())
    }
  })
  trace.push(phase + ':' + name + ':end')
}
const complete = (phase) =>
  trace.filter((step) => step.startsWith(phase + ':') && step.endsWith(':end'))
    .length
for (const name of ['a', 'b']) {
  beforeAll(async () => {
    await meet('outer:beforeAll', name)
    expect(complete('outer:beforeAll')).toBeGreaterThan(0)
    return () => meet('outer:allCleanup', name)
  })
  beforeEach(async () => {
    await meet('outer:beforeEach', name)
    return () => meet('outer:eachCleanup', name)
  })
  afterEach(async () => {
    expect(complete('inner:afterEach') % 2).toBe(0)
    await meet('outer:afterEach', name)
  })
  afterAll(async () => {
    expect(complete('inner:allCleanup')).toBe(2)
    expect(trace.filter((step) => step.startsWith('finished:'))).toEqual([
      'finished:b:start',
      'finished:b:end',
      'finished:a:start',
      'finished:a:end',
    ])
    await meet('outer:afterAll', name)
  })
}
describe('nested boundaries', () => {
  for (const name of ['a', 'b']) {
    beforeAll(async () => {
      expect(complete('outer:beforeAll')).toBe(2)
      await meet('inner:beforeAll', name)
      return () => meet('inner:allCleanup', name)
    })
    beforeEach(async () => {
      expect(complete('outer:beforeEach') % 2).toBe(0)
      await meet('inner:beforeEach', name)
      return () => meet('inner:eachCleanup', name)
    })
    afterEach(() => meet('inner:afterEach', name))
    afterAll(() => meet('inner:afterAll', name))
  }
  test('suite hooks run concurrently and finished callbacks retain stack order', () => {
    expect(complete('inner:beforeAll')).toBe(2)
    expect(complete('inner:beforeEach')).toBe(2)
    for (const name of ['a', 'b'])
      onTestFinished(async () => {
        trace.push('finished:' + name + ':start')
        await Promise.resolve()
        trace.push('finished:' + name + ':end')
      })
  })
  test.fails(
    'failed callbacks run concurrently before expected-failure inversion',
    () => {
      for (const name of ['a', 'b']) {
        onTestFinished(async () => {
          trace.push('failed:finished:' + name + ':start')
          await Promise.resolve()
          trace.push('failed:finished:' + name + ':end')
        })
        onTestFailed(() => meet('failed:listeners', name))
      }
      throw new Error('intentional expected-failure control')
    }
  )
})
