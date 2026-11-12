const assert = require('node:assert/strict')
const assertProfile = require('./assert-profile.cjs')

const timeoutMessage = (ms) =>
  `Test timed out in ${ms}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`
const timeoutError = (ms = 60) => ({
  name: 'Error',
  message: timeoutMessage(ms),
})
const missingReceiver = {
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading '__flags')",
}
const names = {
  'task-context-late-active': ['same-active'],
  'task-context-late-closed': ['same-closed'],
  'task-context-late-foreign': ['owner', 'foreign'],
  'task-context-late-hard-chain': ['closed owner plain hard chains'],
  'task-context-precreated-chain': ['precreated chains after timeout'],
  'task-context-precreated-receivers': ['retained precreated hard receivers'],
  'task-context-precreated-foreign': [
    'owner creates chain',
    'foreign invokes retained chain',
  ],
  'task-context-late-deep': ['closed owner deep hard chains'],
  'task-context-late-equality-testers': [
    'closed owner registered equality testers',
  ],
  'task-context-deep-foreign-receivers': [
    'deep method original owner',
    'deep method receiver owner',
  ],
}

// All three identities must survive a timeout/retry and subsequent late work;
// the count and task state must still reflect the exact point in that work.
function sameOwner(kind, count, state, extra = {}) {
  return {
    kind,
    sameTask: true,
    sameContext: true,
    sameExpect: true,
    contextCount: count,
    localCount: count,
    state,
    aborted: true,
    ...extra,
  }
}

function foreignCounts(kind, A, B, extra = {}) {
  return { kind, A, B, AState: 'run', BState: 'run', ...extra }
}

function deepResult(kind, count = 9) {
  return { kind, result: 'ok', sameReturn: false, count }
}

module.exports = function assertRetainedContext(group, actual) {
  if (!names[group]) return false
  const noTimeout = [
    'task-context-precreated-foreign',
    'task-context-late-equality-testers',
    'task-context-deep-foreign-receivers',
  ].includes(group)
  assertProfile(
    actual,
    names[group].map((name, index) => ({
      name,
      status: 'passed',
      failureCount: Number(!noTimeout && index === 0),
      failureHeaders:
        !noTimeout && index === 0
          ? [
              `Error: ${timeoutMessage(group === 'task-context-late-foreign' ? 1000 : 60)}`,
            ]
          : [],
    }))
  )
  assert.equal(actual.rows.length, 1)
  const value = actual.rows[0].value
  const kind = group.slice('task-context-'.length)

  switch (group) {
    case 'task-context-late-active':
      assert.deepEqual(value, {
        kind,
        trace: [
          sameOwner('body', 1, 'run', { turn: 0, aborted: false }),
          sameOwner('finished', 1, 'fail', { turn: 0, registeredTurn: 0 }),
          sameOwner('body', 1, 'run', { turn: 1 }),
          sameOwner('old-before', 1, 'run', { turn: 1 }),
          sameOwner('old-after', 2, 'run', { turn: 1 }),
          sameOwner('retry-end', 3, 'run', { turn: 1 }),
          sameOwner('finished', 3, 'pass', { turn: 1, registeredTurn: 1 }),
          sameOwner('afterAll', 3, 'pass', { turn: 1, signalSame: true }),
        ],
        errors: [timeoutError()],
      })
      break
    case 'task-context-late-closed':
      assert.deepEqual(value, {
        kind,
        trace: [
          sameOwner('body', 1, 'run', { turn: 0, aborted: false }),
          sameOwner('finished', 1, 'fail', { turn: 0 }),
          sameOwner('body', 1, 'run', { turn: 1 }),
          sameOwner('retry-end', 2, 'run'),
          sameOwner('finished', 2, 'pass', { turn: 1 }),
          ...['afterAll-before', 'old-before'].map((phase) =>
            sameOwner(phase, 2, 'pass')
          ),
          ...['old-after', 'afterAll-after'].map((phase) =>
            sameOwner(phase, 3, 'pass')
          ),
        ],
        errors: [timeoutError()],
      })
      break
    case 'task-context-late-foreign': {
      const final = { A: 4, B: 2, AState: 'pass', BState: 'pass' }
      assert.deepEqual(value, {
        kind,
        A: [
          foreignCounts('body', 1, 1, {
            turn: 0,
            sameContext: true,
            sameExpect: true,
            concurrent: true,
          }),
          foreignCounts('finished', 1, 1, {
            turn: 0,
            sameContext: true,
            AState: 'fail',
          }),
          foreignCounts('body', 1, 1, {
            turn: 1,
            sameContext: true,
            sameExpect: true,
            concurrent: true,
          }),
          foreignCounts('old-before', 2, 1, { sameExpect: true }),
          foreignCounts('old-after', 3, 1),
          foreignCounts('retry-end', 4, 2),
          { kind: 'finished', turn: 1, sameContext: true, ...final },
        ],
        B: [
          foreignCounts('foreign-before', 1, 1, {
            sameContext: true,
            distinctTask: true,
            distinctContext: true,
            distinctExpect: true,
            borrowedExpectSame: true,
          }),
          foreignCounts('foreign-borrowed', 2, 1),
          foreignCounts('foreign-old-joined', 3, 1),
          foreignCounts('foreign-end', 3, 2),
        ],
        final,
        signalsDistinct: true,
        errors: [
          { name: 'owner', errors: [timeoutError(1000)] },
          { name: 'foreign', errors: [] },
        ],
      })
      break
    }
    case 'task-context-late-hard-chain':
      assert.deepEqual(value, {
        kind,
        trace: [
          ...[0, 1].map((turn) => ({ kind: 'body', turn, count: 1 })),
          { kind: 'afterAll-before', state: 'pass', count: 2 },
          { kind: 'late-before', state: 'pass', sameExpect: true, count: 2 },
          { kind: 'action', action: 'not', result: 'ok', count: 3 },
          ...['extracted', 'call'].map((action, index) => ({
            kind: 'action',
            action,
            result: 'error',
            ...missingReceiver,
            count: index + 4,
          })),
          { kind: 'adopted', same: true },
          { kind: 'action', action: 'adoption', result: 'ok', count: 6 },
          { kind: 'afterAll-after', state: 'pass', count: 6 },
        ],
        errors: [timeoutError()],
      })
      break
    case 'task-context-precreated-chain':
      assert.deepEqual(value, {
        kind,
        trace: [
          { kind: 'afterAll-before', state: 'pass', count: 4 },
          ...['direct', 'not'].map((operation) => ({
            kind: operation,
            result: 'ok',
            count: 4,
          })),
          { kind: 'adopted', same: true },
          { kind: 'adoption', result: 'ok', count: 4 },
        ],
        state: 'pass',
        count: 4,
        errors: [timeoutError()],
      })
      break
    case 'task-context-precreated-receivers':
      assert.deepEqual(value, {
        kind,
        trace: [
          {
            kind: 'bind-creation',
            result: 'error',
            name: 'Error',
            message:
              'Invalid Chai property: toBe.length. See docs for proper usage of "toBe".',
          },
          { kind: 'direct', result: 'ok', returnType: 'object', count: 3 },
          { kind: 'extracted', result: 'error', ...missingReceiver, count: 3 },
          ...['own-receiver', 'other-receiver'].map((receiver) => ({
            kind: receiver,
            result: 'ok',
            returnType: 'object',
            count: 3,
          })),
          { kind: 'bound-unavailable' },
          {
            kind: 'mismatch',
            result: 'error',
            name: 'AssertionError',
            message: "expected 'first' to be 'other' // Object.is equality",
            count: 3,
          },
          { kind: 'absent-then', hasThen: false, value: 'undefined' },
          { kind: 'adopted', same: true, count: 3 },
          { kind: 'not', count: 3 },
        ],
        state: 'pass',
        count: 3,
      })
      break
    case 'task-context-precreated-foreign':
      assert.deepEqual(value, {
        kind,
        trace: [
          { kind: 'before', owner: 1, foreign: 0, sameLocal: false },
          {
            kind: 'mismatch',
            name: 'AssertionError',
            message: "expected 'owned' to be 'wrong' // Object.is equality",
          },
          { kind: 'after', owner: 1, foreign: 0, same: true },
        ],
        ownerState: 'pass',
        ownerCount: 1,
      })
      break
    case 'task-context-late-deep':
      assert.deepEqual(value, {
        kind,
        trace: [
          ...[
            'deep',
            'strict',
            'sparse',
            'not-strict',
            'subset',
            'property',
          ].map((operation) => deepResult(operation)),
          { kind: 'property-path', path: ['a.b', 'c'] },
          ...[0, 1].map(() => ({ kind: 'getter', ownReceiver: true })),
          deepResult('getter-property'),
          { kind: 'extracted', result: 'error', ...missingReceiver, count: 9 },
          deepResult('receiver-call'),
          deepResult('returned-chain'),
          {
            kind: 'mismatch',
            result: 'error',
            name: 'AssertionError',
            message:
              'expected { different: [ 5 ] } to deeply equal { different: [ 6 ] }',
            count: 9,
          },
          { kind: 'adopted', same: true, getterCalls: 2, count: 9 },
        ],
        state: 'pass',
        count: 9,
      })
      break
    case 'task-context-late-equality-testers': {
      const tester = (left, right) => ({
        kind: 'tester',
        hasEquals: true,
        left,
        right,
      })
      assert.deepEqual(value, {
        kind,
        trace: [
          tester('FIRST', 'first'),
          deepResult('deep', 4),
          tester('SECOND', 'second'),
          deepResult('strict', 4),
          tester('THIRD', 'third'),
          tester('THIRD', 'third'),
          deepResult('subset', 4),
          tester('fourth', 'FOURTH'),
          deepResult('property', 4),
          tester('FIFTH', 'fifth'),
          deepResult('new-local', 5),
        ],
        state: 'pass',
        count: 5,
      })
      break
    }
    case 'task-context-deep-foreign-receivers':
      assert.deepEqual(value, {
        kind,
        trace: [
          {
            kind: 'bind',
            result: 'error',
            name: 'Error',
            message:
              'Invalid Chai property: toEqual.length. See docs for proper usage of "toEqual".',
          },
          { kind: 'before', owner: 1, foreign: 1 },
          {
            kind: 'returned',
            sameAsReceiver: false,
            sameAsOriginal: false,
            owner: 1,
            foreign: 1,
          },
          { kind: 'undefined-receiver', ...missingReceiver },
          { kind: 'adopted', same: true, owner: 1, foreign: 1 },
          {
            kind: 'afterAll',
            owner: 1,
            foreign: 1,
            ownerState: 'pass',
            foreignState: 'pass',
          },
        ],
      })
      break
  }
  return true
}
