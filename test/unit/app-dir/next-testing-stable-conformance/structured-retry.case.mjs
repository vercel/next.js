/* eslint-disable no-empty-pattern -- Fixtures declare no dependencies. */
/* global AggregateError */
import {
  test,
  describe,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
const trace = []
afterAll(() => console.log('RETRY_TRACE=' + JSON.stringify(trace)))
const attempt = (name, failures) => {
  let count = 0
  return () => {
    trace.push(name + ':' + ++count)
    if (count <= failures) throw new Error(name + ' transient')
  }
}
test('empty options defaults', { retry: {} }, attempt('default', 1))
test('structured count', { retry: { count: 2 } }, attempt('count', 2))
test(
  'regexp accepts',
  { retry: { count: 3, condition: /transient/ } },
  attempt('regex', 2)
)
test(
  'regexp rejects',
  { retry: { count: 3, condition: /permanent/ } },
  attempt('reject', 2)
)
const stateful = /transient/g
test(
  'regexp keeps its state',
  { retry: { count: 3, condition: stateful } },
  attempt('stateful', 3)
)
describe('inherited', { retry: { count: 1, condition: /transient/ } }, () => {
  test('inherits', attempt('inherited', 1))
  test('overrides', { retry: { count: 0 } }, attempt('override', 1))
})
let cleanupAttempts = 0
describe('last cleanup error', () => {
  afterEach(() => {
    trace.push('cleanup:' + cleanupAttempts)
    if (cleanupAttempts === 1) throw new Error('cleanup transient')
  })
  test(
    'uses last error',
    { retry: { count: 1, condition: /cleanup transient/ } },
    () => {
      trace.push('cleanup body:' + ++cleanupAttempts)
      if (cleanupAttempts === 1) throw new Error('unmatched body')
    }
  )
})
let aggregate = 0
test(
  'last aggregate error',
  { retry: { count: 1, condition: /last transient/ } },
  () => {
    trace.push('aggregate:' + ++aggregate)
    if (aggregate === 1)
      throw new AggregateError(
        [new Error('first'), new Error('last transient')],
        'wrapper'
      )
  }
)
let array = 0
test(
  'last array error',
  { retry: { count: 1, condition: /last transient/ } },
  () => {
    trace.push('array:' + ++array)
    // eslint-disable-next-line no-throw-literal -- Published runner accepts thrown error arrays.
    if (array === 1) throw [new Error('first'), new Error('last transient')]
  }
)
let primitive = 0
test(
  'primitive error message',
  { retry: { count: 1, condition: /null/ } },
  () => {
    trace.push('primitive:' + ++primitive)
    // eslint-disable-next-line no-throw-literal -- Primitive failures are part of the reference contract.
    if (primitive === 1) throw null
  }
)
let expected = 0
test.fails(
  'inversion precedes condition',
  { retry: { count: 1, condition: /Expect test to fail/ } },
  () => {
    trace.push('expected:' + ++expected)
    if (expected === 2) throw new Error('expected')
  }
)
let repeated = 0
test(
  'retry each repeat',
  { repeats: 1, retry: { count: 1, condition: /transient/ } },
  () => {
    trace.push('repeat:' + ++repeated)
    if (repeated % 2) throw new Error('repeat transient')
  }
)
const fixtureTest = test.extend({
  value: async ({}, provide) => {
    trace.push('fixture setup')
    await provide(42)
    trace.push('fixture cleanup')
  },
})
let fixtures = 0
fixtureTest(
  'fixtures surround delay',
  { retry: { count: 1, delay: 10 } },
  ({ value }) => {
    expect(value).toBe(42)
    trace.push('fixture body:' + ++fixtures)
    if (fixtures === 1) throw new Error('fixture retry')
  }
)
test(
  'published CLI removes false predicate',
  {
    retry: {
      count: 1,
      condition() {
        trace.push('unexpected false predicate')
        return false
      },
    },
  },
  attempt('function false', 1)
)
test(
  'published CLI removes throwing predicate',
  {
    retry: {
      count: 1,
      condition() {
        trace.push('unexpected throwing predicate')
        throw new Error('predicate exploded')
      },
    },
  },
  attempt('function throws', 1)
)
describe('real retry delay with fake timers', () => {
  beforeAll(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterAll(() => vi.useRealTimers())
  let started
  test(
    'delay uses captured timers',
    { retry: { count: 1, delay: 25.5 } },
    () => {
      if (started === undefined) {
        started = process.hrtime.bigint()
        trace.push('delay first')
        throw new Error('delay retry')
      }
      trace.push(
        'delay elapsed:' + (process.hrtime.bigint() - started >= 20_000_000n)
      )
    }
  )
})
test(
  'skip bypasses structured retry',
  { retry: { count: 2, delay: 10000, condition: /./ } },
  ({ skip }) => {
    trace.push('skip once')
    skip('no retry')
  }
)

let empty = 0
test(
  'empty aggregate does not retry without an error',
  { retry: { count: 2 } },
  () => {
    trace.push('empty:' + ++empty)
    throw new AggregateError([], 'empty wrapper')
  }
)
let history = 0
test(
  'empty aggregate retains prior error for condition',
  { retry: { count: 2, condition: /history transient/ } },
  () => {
    trace.push('history:' + ++history)
    if (history === 1) throw new Error('history transient')
    if (history === 2) throw new AggregateError([], 'empty wrapper')
  }
)

let emptyArray = 0
test(
  'empty thrown array fails without retrying',
  { retry: { count: 2 } },
  () => {
    trace.push('empty array:' + ++emptyArray)
    expect.assertions(1)
    // eslint-disable-next-line no-throw-literal -- Empty error arrays still fail the reference task.
    throw []
  }
)

describe('empty thrown array in setup', () => {
  beforeEach(() => {
    trace.push('empty setup')
    expect.assertions(1)
    // eslint-disable-next-line no-throw-literal -- Verify failure state independently of diagnostic length.
    throw []
  })
  afterEach(() => trace.push('empty setup cleanup'))
  test('does not execute body or retry', { retry: { count: 2 } }, () =>
    trace.push('unreachable setup body')
  )
})

let multiline = 0
test(
  'multiline primitive message',
  { retry: { count: 1, condition: /multiline\ntransient/ } },
  () => {
    trace.push('multiline:' + ++multiline)
    // eslint-disable-next-line no-throw-literal -- Preserve complete primitive messages without an added heading.
    if (multiline === 1) throw 'multiline\ntransient'
  }
)
let noStack = 0
test(
  'named failure without stack',
  { retry: { count: 1, condition: /bare transient/ } },
  () => {
    trace.push('no stack:' + ++noStack)
    if (noStack === 1) {
      // eslint-disable-next-line no-throw-literal -- Error-shaped objects need not carry a stack.
      throw { name: 'Fault', message: 'bare transient', stack: '' }
    }
  }
)
test(
  'explicit undefined retry defaults',
  { retry: undefined },
  attempt('undefined', 1)
)
