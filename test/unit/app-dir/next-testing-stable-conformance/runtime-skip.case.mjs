import {
  test,
  describe,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  onTestFinished,
  onTestFailed,
} from 'vitest'
const order = []
const record = (s) => order.push(s)
afterAll(() => console.log('SKIP_TRACE=' + JSON.stringify(order)))
test('plain', ({ skip }) => {
  onTestFinished(() => record('plain finished'))
  onTestFailed(() => record('plain failed'))
  skip('reason')
  record('unreachable')
})
test('false continues', ({ skip }) => {
  skip(false, 'unused')
  record('false body')
  expect(true).toBe(true)
})
test('true condition', async ({ skip }) => {
  await Promise.resolve()
  skip(true, 'condition reason')
})
test('caught skip stays skipped', ({ skip }) => {
  try {
    skip('caught')
  } catch (error) {
    record('caught')
    record(
      [
        error.name,
        error.constructor.name,
        error.code,
        error.note,
        typeof error.taskId,
      ].join(':')
    )
  }
  onTestFailed(() => record('caught count failed'))
  expect.assertions(100)
})
describe('setup skip', () => {
  beforeEach(({ skip }) => {
    record('setup')
    skip()
  })
  afterEach(() => record('setup after'))
  test('body prevented', () => {
    record('setup body')
  })
})
describe('teardown skip', () => {
  afterEach(({ skip }) => {
    record('teardown')
    skip('teardown reason')
  })
  test('body fails then skipped', () => {
    onTestFailed(() => record('teardown failed'))
    throw new Error('discard on skip')
  })
})
describe('teardown error', () => {
  afterEach(() => {
    record('bad teardown')
    throw new Error('teardown failure')
  })
  test('skip retains outcome', ({ skip }) => {
    onTestFailed(() => record('bad teardown failed'))
    skip()
  })
})
const extended = test.extend({
  value: async ({ skip }, provide) => {
    record('fixture setup')
    skip('fixture')
    await provide(42)
    record('fixture teardown')
  },
})
extended('fixture skips before use', ({ value }) => {
  record('fixture body ' + value)
})
test.fails('skip before inversion', { retry: 2, repeats: 1 }, ({ skip }) => {
  record('fails body')
  skip()
})
let retries = 0
test('skip after a failed retry', { retry: 2 }, ({ skip }) => {
  record('retry body')
  if (++retries === 1) throw new Error('first')
  skip()
})
let repeats = 0
test('skip after a failed repeat', { repeats: 2 }, ({ skip }) => {
  record('repeat body')
  if (++repeats === 1) throw new Error('first')
  skip()
})
test('finished skip', ({ skip }) => {
  onTestFinished(() => {
    record('finished skip')
    skip()
  })
  expect.assertions(1)
  expect(true).toBe(true)
})
test('failed listener skips', ({ skip }) => {
  onTestFailed(() => {
    record('failed skip')
    skip()
  })
  throw new Error('listener skips failure')
})

test('soft failure before skip', ({ skip }) => {
  onTestFailed(() => record('soft skip failed'))
  expect.soft(1).toBe(2)
  skip('soft skip')
})
describe('multiple teardown hooks skip', () => {
  beforeEach(() => () => record('skipped returned cleanup'))
  afterEach(() => record('skipped remaining teardown'))
  afterEach(({ skip }) => {
    record('first teardown skip')
    skip()
  })
  test('skip aborts remaining teardown callbacks', () =>
    record('multiple body'))
})
const lateFixture = test.extend({
  // eslint-disable-next-line no-empty-pattern -- Declares no fixture dependencies.
  late: async ({}, provide) => {
    record('late fixture setup')
    await provide(42)
    record('late fixture cleanup')
  },
})
describe('teardown skip defers fixture cleanup', () => {
  afterEach(({ skip }) => skip())
  lateFixture('fixture remains until finished listeners', ({ late }) => {
    record('late fixture body ' + late)
    onTestFinished(() => record('late fixture finished'))
  })
})
