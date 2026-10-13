import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest'

const order = []
const record = (value) => order.push(value)
beforeAll(() => {
  record('beforeAll')
  return () => record('beforeAll cleanup')
})
beforeEach(() => {
  record('beforeEach')
  onTestFinished(() => record('finished'))
})
afterEach(() => record('afterEach'))
afterAll(() => console.log('CONFORMANCE_TRACE=' + JSON.stringify(order)))

const extended = test.extend({
  // eslint-disable-next-line no-empty-pattern -- Declares no fixture dependencies.
  number: async ({}, provide) => {
    record('fixture setup')
    await provide(42)
    record('fixture teardown')
  },
})
describe('existing helper', () => {
  extended('lazy fixture', ({ number }) => {
    record('body fixture')
    expect(number).toBe(42)
  })
  test.each([
    [1, 2, 3],
    [2, 4, 6],
  ])('adds %i and %i', (left, right, sum) => {
    record('body each')
    expect(left + right).toBe(sum)
  })
  let attempts = 0
  test('retry', { retry: 1 }, () => {
    record('body retry')
    expect(++attempts).toBe(2)
  })
  test.fails('expected failure', () => {
    record('body expected failure')
    expect(1).toBe(2)
  })
  test.skip('skipped', () => {
    throw new Error('skipped body must not execute')
  })
  test.todo('todo')
})
