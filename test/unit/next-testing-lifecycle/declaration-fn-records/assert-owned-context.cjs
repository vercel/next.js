const assert = require('node:assert/strict')
const assertProfile = require('./assert-profile.cjs')

function passed(actual, names, shape = 'heads', options) {
  assertProfile(
    actual,
    names.map((name) => ({
      name,
      status: 'passed',
      ...(shape === 'messages'
        ? { failureMessages: [] }
        : {
            failureCount: 0,
            [shape === 'headers' ? 'failureHeaders' : 'failureHeads']: [],
          }),
    })),
    options
  )
}

function traceOf(actual, kind, metadata) {
  assert.equal(actual.rows.length, 1)
  const { trace, ...rest } = actual.rows[0].value
  assert.deepEqual(rest, { kind, ...metadata })
  assert.ok(Array.isArray(trace))
  return trace
}

function ownedMatcher(phase, actual = 'owned', expected = actual, extra = {}) {
  return {
    phase,
    kind: 'matcher',
    sameAssertion: true,
    sameTask: true,
    actual,
    expected,
    ...extra,
  }
}

function taskMatcher(phase, actual, task, native = false) {
  return {
    phase,
    kind: 'matcher',
    sameAssertion: true,
    taskA: task === 'A',
    taskB: task === 'B',
    ...(native ? { hasTask: true } : { noTask: task === undefined }),
    actual,
    expected: actual,
  }
}

function returned(phase) {
  return { phase, kind: 'return', undefined: true }
}

module.exports = function assertOwnedContext(group, actual) {
  switch (group) {
    case 'task-context-actual-task-async': {
      assert.equal(actual.rows.length, 1)
      const names = [
        'actual Task native soft',
        'actual Task native unawaited',
        'actual Task native awaited',
      ]
      const errors = [
        'AssertionError: expected 1 to be 2 // Object.is equality',
        'Error: Promise returned by `expect(actual).resolves.toBe(expected)` was not awaited. This assertion is asynchronous and must be awaited; otherwise, it is not guaranteed to complete before the test finishes:',
      ]
      assertProfile(
        actual,
        names.map((name, index) => ({
          name,
          status: index < 2 ? 'failed' : 'passed',
          failureCount: index < 2 ? 1 : 0,
          failureHeads: index < 2 ? [errors[index]] : [],
        }))
      )
      const { results, ...row } = actual.rows[0].value
      assert.deepEqual(
        results,
        names.map((name, index) => ({
          name,
          state: index < 2 ? 'fail' : 'pass',
          errorCount: index < 2 ? 1 : 0,
        }))
      )
      assert.deepEqual(row, {
        kind: 'actual-Task-native-async',
        trace: ['soft-body', 'unawaited-body', 'awaited-body'].map(
          (phase, index) => ({
            phase,
            count: index < 2 ? 1 : 2,
          })
        ),
      })
      break
    }
    case 'task-context-late-source-flags': {
      passed(actual, ['late source task A', 'late source task B'], 'headers')
      const trace = traceOf(actual, 'late-source-flags', {
        countA: 3,
        countB: 1,
      })
      const flag = (phase, task = 'A') => ({
        phase,
        kind: 'flag',
        taskA: task === 'A',
        taskB: task === 'B',
        noTask: false,
      })
      assert.deepEqual(trace, [
        flag('live-A'),
        flag('live-B', 'B'),
        ...['foreign', 'closed'].flatMap((phase) => [
          flag(`${phase}-created-A`),
          flag(`after-${phase}-transfer`),
          {
            ...taskMatcher(`${phase}-transfer`, `${phase}-A`, 'A'),
            sameAssertion: true,
          },
        ]),
      ])
      break
    }
    case 'task-context-id-publication': {
      passed(actual, ['current', 'shared'], 'messages')
      const trace = traceOf(actual, 'id-publication')
      const scenarios = ['different-name', 'same-name']
      assert.deepEqual(trace, [
        ...scenarios.flatMap((scenario) => [
          {
            scenario,
            phase: 'old-created',
            emptyId: true,
            contextTaskSame: true,
          },
          {
            scenario,
            phase: 'current-created',
            oldEmpty: true,
            currentEmpty: true,
            sameId: true,
          },
          {
            scenario,
            phase: 'manual-collect',
            oldEmpty: true,
            currentEmpty: true,
            sameTask: true,
            discardedAbsent: true,
          },
        ]),
        ...scenarios.map((scenario) => ({
          scenario,
          phase: 'running',
          oldEmpty: true,
          currentNonempty: true,
          sameId: false,
          oldContextTaskSame: true,
          currentContextSame: true,
          currentContextTaskSame: true,
          distinctContext: true,
          distinctExpect: true,
          oldCount: 1,
          currentCount: 0,
        })),
      ])
      break
    }
    case 'task-context-id-suite': {
      passed(
        actual,
        ['ordinary raw task', 'ordinary raw suite inside raw suite'],
        'messages'
      )
      assert.deepEqual(traceOf(actual, 'id-suite'), [
        {
          phase: 'collection-before',
          rootReturnUndefined: true,
          suiteIdEmpty: true,
          fileIdNonempty: true,
        },
        { phase: 'factory', suiteIdEmpty: true, insideIdEmpty: true },
        {
          phase: 'manual-collect',
          suiteIdEmpty: true,
          collectedIdEmpty: true,
          insideIdEmpty: true,
          suiteSame: true,
          sameTask: true,
        },
        {
          phase: 'beforeAll',
          suiteIdNonempty: true,
          insideIdNonempty: true,
          collectedSame: true,
        },
        { phase: 'root-body', nonemptyId: true, sameFile: true },
        {
          phase: 'inside-body',
          sameTask: true,
          nonemptyId: true,
          suiteSame: true,
        },
      ])
      break
    }
    case 'task-context-transfer-effects': {
      passed(
        actual,
        [
          'transfer actual task A',
          'transfer ownership and exact partial copies',
        ],
        'messages'
      )
      const trace = traceOf(actual, 'transfer-effects', {
        countA: 1,
        countB: 1,
        stateA: 'pass',
        stateB: 'pass',
      })
      const failure = (phase) => ({
        phase,
        kind: 'throw',
        sameError: true,
        name: 'Error',
        message: 'transfer-exact-copy-failure',
      })
      assert.deepEqual(trace, [
        taskMatcher('initial-A', 'A', 'A'),
        taskMatcher('initial-B', 'B', 'B'),
        returned('known-to-known'),
        taskMatcher('known-raw-B', 'A', 'A'),
        taskMatcher('known-public-B', 'A', 'A'),
        returned('unknown-preserves-task'),
        taskMatcher('unknown-source', 'unknown', 'A'),
        returned('explicit-undefined-task'),
        taskMatcher('undefined-source', 'unknown'),
        returned('restore-A'),
        taskMatcher('restored-source', 'A', 'A'),
        { phase: 'partial-getter', kind: 'read' },
        failure('partial-after-task'),
        taskMatcher('partial-task-applied', 'partial', 'A'),
        { phase: 'failed-task-getter', kind: 'read' },
        failure('failed-task-read'),
        taskMatcher('failed-task-stays', 'partial', 'A'),
        returned('filtered-base-values'),
        taskMatcher('filtered-object-stays', 'partial', 'B'),
        returned('ordinary-payload'),
        { phase: 'payload-result', flags: { object: 17, tag: 'payload' } },
        returned('hook-transfer'),
        taskMatcher('afterAll-raw-B', 'A', 'A'),
        taskMatcher('afterAll-public-B', 'A', 'A'),
      ])
      break
    }
    case 'task-context-transfer-plain':
      passed(
        actual,
        ['copies original flags to ordinary caller payload'],
        'messages'
      )
      assert.deepEqual(
        actual.rows.map((row) => row.value),
        [
          {
            kind: 'transfer-plain',
            returnedUndefined: true,
            subject: 'ok',
            sourceSubject: 'ok',
            count: 0,
          },
        ]
      )
      break
    case 'task-context-transfer-setters': {
      passed(
        actual,
        ['task setter source A', 'actual setter state remains authoritative'],
        'messages'
      )
      assert.deepEqual(
        traceOf(actual, 'transfer-setters', { countA: 1, countB: 1 }),
        [
          ...['undefined-then-throw', 'ignore', 'store'].flatMap(
            (phase, index) => [
              index === 0
                ? { phase, kind: 'throw', sameError: true }
                : returned(phase),
              taskMatcher(`${phase}-call`, 'A', [undefined, 'B', 'A'][index]),
              {
                phase,
                kind: 'observations',
                copyGets: 0,
                copySets: 1,
                matcherGets: 2,
              },
            ]
          ),
        ]
      )
      break
    }
    case 'task-context-transfer-invocations':
      passed(
        actual,
        ['actual matcher Task reads and nested receiver calls'],
        'messages'
      )
      assert.deepEqual(traceOf(actual, 'transfer-invocations', { count: 1 }), [
        { phase: 'async', kind: 'async', sameTask: true, sameAssertion: true },
        { phase: 'async', kind: 'reads', reads: 1 },
        ...['outer', 'inner'].map((kind) => ({
          phase: 'nested',
          kind,
          sameTask: true,
          sameAssertion: true,
        })),
        { phase: 'nested', kind: 'reads', reads: 4 },
      ])
      break
    case 'task-context-owned-properties':
      passed(actual, ['owned custom property source'])
      assert.deepEqual(
        traceOf(actual, 'owned-property', {
          getCount: 2,
          methodCount: 2,
          count: 1,
          state: 'pass',
        }),
        ['body', 'afterAll'].flatMap((phase) => [
          { phase, kind: 'getter', sameReceiver: false },
          { phase, kind: 'method', sameReceiver: true },
          {
            phase,
            kind: 'read',
            sameAssertion: false,
            sameMethod: true,
            sameReturn: true,
          },
        ])
      )
      break
    case 'task-context-owned-getter-view':
    case 'task-context-owned-getter-capture': {
      const capture = group.endsWith('capture')
      passed(actual, [
        capture ? 'owned getter captured source' : 'owned getter alias source',
      ])
      const trace = traceOf(
        actual,
        capture ? 'owned-getter-capture' : 'owned-getter-view',
        { count: 1, state: 'pass' }
      )
      assert.deepEqual(
        trace,
        ['body', 'afterAll'].flatMap((phase, index) => [
          {
            phase,
            kind: 'getter',
            [capture ? 'sameOriginal' : 'sameReceiver']: false,
          },
          capture
            ? {
                phase,
                kind: 'capture',
                ...(index
                  ? { sameAlias: true, aliasSameCaptured: true }
                  : { aliasSameCaptured: true, aliasSameOriginal: false }),
              }
            : {
                phase,
                kind: index ? 'alias-again' : 'alias',
                [index ? 'sameAlias' : 'sameOriginal']: Boolean(index),
              },
          ...Array.from({ length: capture || !index ? 3 : 2 }, () =>
            ownedMatcher(phase)
          ),
        ])
      )
      break
    }
    case 'task-context-owned-function-receivers':
      passed(actual, ['owned function receiver source'])
      assert.deepEqual(
        traceOf(actual, 'owned-function-receivers', {
          count: 1,
          state: 'pass',
        }),
        ['body', 'afterAll'].flatMap((phase) => [
          ...[
            'assertion',
            'assertion',
            'assertion',
            'foreign',
            'undefined',
          ].map((receiver) => ({ phase, kind: 'invoke', receiver })),
          {
            phase,
            kind: 'reads',
            sameMethod: true,
            sameDescriptor: true,
            direct: true,
            call: true,
            bound: true,
            foreign: true,
            extracted: true,
          },
        ])
      )
      break
    case 'task-context-owned-getter-returned-chain':
    case 'task-context-owned-getter-builtin-chain': {
      const builtin = group.endsWith('builtin-chain')
      passed(actual, [
        builtin
          ? 'owned getter builtin chain source'
          : 'owned getter returned chain source',
      ])
      assert.deepEqual(
        traceOf(
          actual,
          builtin
            ? 'owned-getter-builtin-chain'
            : 'owned-getter-returned-chain',
          { count: 1, state: 'pass' }
        ),
        [
          ...(!builtin ? [ownedMatcher('body')] : []),
          {
            phase: 'body',
            kind: 'returned',
            sameAlias: false,
            sameOriginal: false,
            hasThen: 'undefined',
          },
          ownedMatcher('body'),
          ...(!builtin ? [ownedMatcher('afterAll')] : []),
          {
            phase: 'afterAll',
            kind: 'returned',
            samePrevious: false,
            sameAlias: false,
          },
          ownedMatcher('afterAll'),
          ownedMatcher('afterAll'),
        ]
      )
      break
    }
    case 'task-context-owned-getter-native-calls': {
      passed(actual, ['native source A', 'native foreign receiver B'])
      const bind = (phase) => ({
        phase,
        kind: 'bind',
        name: 'Error',
        message:
          'Invalid Chai property: toBe.length. See docs for proper usage of "toBe".',
      })
      assert.deepEqual(
        traceOf(actual, 'owned-getter-native-calls', {
          callsA: 1,
          callsB: 1,
          stateA: 'pass',
          stateB: 'pass',
        }),
        [
          { phase: 'A', kind: 'returned', sameAlias: false },
          taskMatcher('A', 'A', 'A', true),
          taskMatcher('B', 'B', 'B', true),
          bind('B'),
          taskMatcher('B', 'A', 'A', true),
          {
            phase: 'B',
            kind: 'bare',
            name: 'TypeError',
            message: "Cannot read properties of undefined (reading '__flags')",
          },
          taskMatcher('afterAll', 'B', 'B', true),
          bind('afterAll'),
        ]
      )
      break
    }
    case 'task-context-owned-getter-native-properties':
      passed(actual, ['native property lineage'])
      assert.deepEqual(
        traceOf(actual, 'owned-getter-native-properties', {
          calls: 1,
          state: 'pass',
        }),
        [
          { phase: 'body', kind: 'identity', sameAlias: false },
          ...['body', 'afterAll'].flatMap((phase) => [
            ownedMatcher(phase, 'value'),
            ownedMatcher(phase, 'value', 'other', { isNot: true }),
          ]),
        ]
      )
      break
    case 'task-context-late-builtin-overrides': {
      passed(actual, ['live built-in override public inputs'])
      const sync = (actual) => ({
        kind: 'sync',
        actual,
        expected: actual,
        promise: '',
        hasEquals: true,
      })
      const asyncRows = [
        { kind: 'async-enter', actual: 2, expected: 2, promise: '' },
        { kind: 'async-leave', actual: 2, expected: 2 },
      ]
      assert.deepEqual(
        traceOf(actual, 'late-builtin-overrides', { state: 'pass', count: 3 }),
        [
          sync({ n: 1 }),
          ...asyncRows,
          { kind: 'live-count', count: 2 },
          sync({ n: 1 }),
          { kind: 'closed-sync', result: 'ok', count: 2 },
          ...asyncRows,
          { kind: 'closed-async', result: 'ok', count: 2 },
          sync(3),
          { kind: 'new-closed-sync', result: 'ok', count: 3 },
        ]
      )
      break
    }
    case 'task-context-custom-task-state': {
      const names = [
        'custom origin owner',
        'custom foreign success',
        'custom foreign failure',
      ]
      assertProfile(
        actual,
        names.map((name, index) => ({
          name,
          status: index === 2 ? 'failed' : 'passed',
          failureCount: index === 2 ? 1 : 0,
          failureHeads: index === 2 ? ['Error: custom async mismatch'] : [],
        }))
      )
      const observations = (phase, kind, actual, expected = actual) => ({
        phase,
        kind,
        actual,
        expected,
        taskSameOwner: true,
        taskSameCaller: phase === 'owner',
        taskHasContext: true,
        currentTestName: names[0],
        assertionCalls: 0,
        ownerState: phase === 'owner' ? 'run' : 'pass',
      })
      const standard = (phase) =>
        ['sync', 'async-enter', 'async-leave'].map((kind) =>
          observations(phase, kind, kind === 'sync' ? 'sync' : 'async')
        )
      assert.deepEqual(
        traceOf(actual, 'custom-task-state', {
          ownerCount: 3,
          ownerState: 'pass',
          foreignState: 'pass',
          failedCallerState: 'fail',
        }),
        [
          ...standard('owner'),
          ...standard('foreign'),
          observations('foreign', 'sync', 'new'),
          { kind: 'foreign-counts', owner: 3, caller: 0 },
          ...['async-enter', 'async-leave'].map((kind) =>
            observations('failure', kind, 'async', 'wrong')
          ),
          ...standard('afterAll'),
        ]
      )
      break
    }
    case 'task-context-custom-unawaited':
      passed(actual, ['closed custom unawaited source'], 'heads', { exit: 1 })
      assert.deepEqual(
        traceOf(actual, 'custom-unawaited', { state: 'pass', count: 1 }),
        ['matcher-enter', 'matcher-settle'].map((kind) => ({
          kind,
          actual: 1,
          expected: 2,
          ownerState: 'pass',
        }))
      )
      break
    case 'task-context-custom-prepared': {
      passed(actual, ['prepared custom owner'])
      const observation = (phase, value) => ({
        phase,
        actual: value,
        expected: value,
        taskSameOwner: true,
        taskHasContext: true,
        currentTestName: 'prepared custom owner',
        assertionCalls: 0,
      })
      assert.deepEqual(
        traceOf(actual, 'custom-prepared', { count: 2, state: 'pass' }),
        [
          observation('collection', 1),
          { kind: 'body-context', sameLocal: true, priorCount: 1 },
          observation('body', 2),
        ]
      )
      break
    }
    case 'task-context-readonly-own-native-get':
      passed(actual, ['readonly own exact native get'])
      assert.deepEqual(
        traceOf(actual, 'readonly-own-native-get', {
          reads: 1,
          count: 1,
          state: 'pass',
        }),
        [
          { kind: 'get', sameValue: true, sameAuthored: true },
          { kind: 'call', expected: 1, sameReceiver: true },
          { kind: 'return', sameValue: true },
        ]
      )
      break
    case 'task-context-readonly-own-method':
      passed(actual, ['readonly own assertion method'])
      assert.deepEqual(
        traceOf(actual, 'readonly-own-method', {
          calls: 2,
          count: 1,
          state: 'pass',
        }),
        [
          { kind: 'callback', expected: 1, sameReceiver: true },
          { kind: 'live', result: 'ok', sameReturn: true },
          {
            kind: 'descriptor',
            writable: false,
            configurable: false,
            enumerable: false,
          },
          { kind: 'callback', expected: 2, sameReceiver: true },
          { kind: 'closed', result: 'ok', sameReturn: true },
        ]
      )
      break
    case 'task-context-custom-assertion-view': {
      const names = [
        'custom view original owner',
        'custom view borrowed receiver',
      ]
      passed(actual, names)
      const observation = (phase, value, index = 0) => ({
        phase,
        actual: value,
        expected: value,
        assertionSameReceiver: true,
        taskSameReceiver: true,
        currentTestName: names[index],
      })
      assert.deepEqual(
        traceOf(actual, 'custom-assertion-view', {
          aState: 'pass',
          bState: 'pass',
          aCount: 1,
          bCount: 1,
        }),
        [
          observation('owner', 'A'),
          observation('borrowed', 'B', 1),
          {
            kind: 'returned',
            sameReceiver: false,
            ownerCount: 1,
            receiverCount: 1,
          },
          observation('afterAll', 'A'),
        ]
      )
      break
    }
    default:
      return false
  }
  return true
}
