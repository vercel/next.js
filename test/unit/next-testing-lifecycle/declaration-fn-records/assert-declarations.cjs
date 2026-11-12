const assert = require('node:assert/strict')
const assertProfile = require('./assert-profile.cjs')

const passed = (names) =>
  names.map((name) => ({ name, status: 'passed', failureMessages: [] }))
const result = (name, status) => ({ name, status, failureMessages: [] })
const error = (name, message) => ({ name, message })
const receiverError = (receiver, property) =>
  error(
    'TypeError',
    `Cannot read properties of ${receiver} (reading '${property}')`
  )
const timeout = (ms) =>
  error(
    'Error',
    `Test timed out in ${ms}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`
  )
const descriptor = { enumerable: false, configurable: false, writable: false }
const contextDescriptor = {
  enumerable: false,
  configurable: true,
  writable: true,
  getter: false,
  setter: false,
}
const expectDescriptor = {
  enumerable: false,
  configurable: false,
  getter: true,
  setter: false,
}
const contextFields = {
  contextType: 'function',
  taskIdentity: true,
  signalAborted: false,
  contextDescriptor,
  expectDescriptor,
}
const done = {
  error: error('Error', 'done() callback is deprecated, use promise instead'),
}
const modifiers = (keys) =>
  keys.map((key) => ({ key, type: 'undefined', own: false }))

function rows(actual, expected) {
  assert.deepEqual(
    actual.rows.map((row) => row.value),
    expected
  )
}

function collector(tasks = []) {
  return {
    type: 'collector',
    name: 'raw suite',
    mode: 'run',
    keys: 'type name mode suite options test file tasks collect task clear on'.split(
      ' '
    ),
    tasks: tasks.map((name) => ({ type: 'test', name, mode: 'run' })),
    suite: { name: 'raw suite', mode: 'run', tasks: tasks.length },
    fileType: 'object',
    methods: {
      collect: { name: 'collect', length: 1 },
      task: { name: 'task', length: 0 },
      clear: { name: 'clear', length: 0 },
      on: { name: 'addHook', length: 1 },
      test: { name: 'chain', length: 0 },
    },
  }
}

function taskShape(name) {
  const parent = name.startsWith('inside-') ? 'first' : null
  return {
    name,
    type: 'test',
    parent,
    fullName: `task-scope.case.mjs > ${parent ? `${parent} > ` : ''}${name}`,
    contextEnumerable: false,
  }
}

module.exports = function assertDeclarations(group, actual) {
  let cases
  switch (group) {
    case 'contract': {
      const helperKeys =
        'each for skipIf runIf override scoped extend describe suite beforeEach afterEach beforeAll afterAll aroundEach aroundAll'.split(
          ' '
        )
      const caseRow = (name, concurrent = null, fails = false, meta = {}) => ({
        event: 'case',
        name,
        task: name,
        concurrent,
        fails,
        meta,
        valueType: 'undefined',
      })
      rows(actual, [
        {
          kind: 'surface',
          fn: {
            type: 'function',
            name: '',
            length: 3,
            keys: ['length', 'name', 'prototype', ...helperKeys],
            descriptor,
            sameRead: true,
            alias: true,
            ownFn: 'undefined',
            eachSame: true,
            forSame: true,
            extendSame: true,
            describeSame: true,
            suiteSame: true,
          },
          modifiers: modifiers(['skip', 'only', 'todo', 'concurrent', 'fails']),
          conditions: { skipIf: true, runIf: true },
          extended: {
            different: true,
            name: '',
            length: 3,
            eachSame: true,
            extendSame: true,
            skipFn: 'undefined',
          },
        },
        {
          kind: 'trace',
          trace: [
            ...[
              'plain',
              'skipped',
              'todo',
              'fails',
              'concurrent',
              'options-fails',
            ].map((name) => ({
              event: 'declared',
              name,
              returned: 'undefined',
            })),
            ...['undefined', 'null'].map((name) => ({
              event: 'receiver-error',
              name,
              error: receiverError(name, 'concurrent'),
            })),
            ...['empty', 'primitive'].map((name) => ({
              event: 'receiver-declared',
              name,
              returned: 'undefined',
            })),
            {
              event: 'reads',
              reads: [
                'receiver:concurrent',
                'options:set-concurrent:false',
                'receiver:concurrent',
                'receiver:only',
                'receiver:skip',
                'receiver:todo',
                'receiver:fails',
                'receiver:ignored',
                'options:get-concurrent',
              ],
              mutatedOption: false,
            },
            ...['each', 'for', 'extend', 'override'].map((key) => ({
              event: 'raw-helper-error',
              key,
              ...receiverError(
                'undefined',
                key === 'each' || key === 'for' ? 'withContext' : 'getFixtures'
              ),
            })),
            caseRow('plain'),
            caseRow('fails', null, true),
            caseRow('concurrent', true),
            caseRow('options-fails', null, true),
            caseRow('receiver-empty', null, null),
            caseRow('receiver-primitive', null, null),
            caseRow('extended raw'),
            { event: 'ordinary-fixture', value: 3 },
            caseRow('observed receiver', null, false, { from: 'options' }),
            {
              event: 'inside-case',
              error: error(
                'Error',
                'Calling the test function inside another test function is not allowed. Please put it inside "describe" or "suite" so it can be properly collected.'
              ),
            },
          ],
        },
      ])
      cases = [
        ...passed(['plain']),
        result('skipped', 'skipped'),
        result('todo', 'todo'),
        ...passed([
          'fails',
          'concurrent',
          'options-fails',
          'receiver-empty',
          'receiver-primitive',
          'extended raw',
          'ordinary extended',
          'observed receiver',
        ]),
        result('borrowed skipped 1', 'skipped'),
        ...passed(['inside case', 'control']),
      ]
      break
    }
    case 'focus':
      rows(actual, [
        {
          kind: 'focus',
          trace: [{ name: 'focused raw', mode: 'run', fails: false }],
        },
      ])
      cases = [
        result('unfocused ordinary', 'skipped'),
        ...passed(['focused raw']),
        result('unfocused raw', 'skipped'),
      ]
      break
    case 'retention': {
      const aliases = {
        test: true,
        describe: true,
        rawDescribe: true,
        rawSuite: true,
        testDescribe: true,
      }
      rows(actual, [
        {
          kind: 'ordinary-retention',
          trace: [
            ...['each', 'for'].flatMap((key) =>
              ['extracted', 'invalid receiver'].map((prefix) => ({
                label: `${prefix} ${key}`,
                error: receiverError('undefined', 'withContext'),
              }))
            ),
            { label: 'extracted skipIf false', type: 'undefined' },
            {
              label: 'extracted skipIf true',
              error: receiverError('undefined', 'skip'),
            },
            { label: 'extracted runIf true', type: 'undefined' },
            {
              label: 'extracted runIf false',
              error: receiverError('undefined', 'skip'),
            },
            {
              label: 'conditions',
              skipFalse: true,
              runTrue: true,
              boundSkipFalse: true,
              boundRunTrue: true,
            },
            ...['each', 'for'].flatMap((key) => [
              { label: `bound ${key}`, value: 2 },
              { label: `called ${key}`, value: 4 },
            ]),
            { label: 'borrowed fixture', value: 6, fixture: 3 },
            { label: 'first realm', ...aliases },
          ],
        },
        {
          kind: 'realm-retention',
          trace: [{ label: 'second realm', ...aliases }],
        },
      ])
      cases = [
        ...passed([
          'borrowed fixture 6',
          'bound each 2',
          'bound for 2',
          'cached suite second realm aliases',
          'called each 4',
          'called for 4',
        ]),
        result('called not run', 'skipped'),
        result('called skipped', 'skipped'),
        ...passed(['first realm aliases']),
      ]
      break
    }
    case 'suite-collector':
      rows(actual, [
        {
          kind: 'suite-surface',
          raw: {
            name: 'suiteFn',
            length: 3,
            keys: [
              'length',
              'name',
              'prototype',
              'each',
              'for',
              'skipIf',
              'runIf',
            ],
            sameAlias: true,
            descriptor,
            modifiers: modifiers([
              'only',
              'skip',
              'todo',
              'concurrent',
              'shuffle',
            ]),
          },
        },
        {
          kind: 'suite-trace',
          trace: [
            {
              kind: 'immediate',
              reads: [
                'options:shuffle',
                'receiver:shuffle',
                'receiver:only',
                'receiver:skip',
                'receiver:todo',
                'receiver:concurrent',
                'receiver:each',
              ],
              optionsSame: false,
              metaSame: true,
              authoredShuffle: true,
              shape: collector(),
            },
            {
              kind: 'collect-error',
              name: 'TypeError',
              message: 'File is required to collect tasks.',
            },
            ...['undefined', 'null'].map((receiver) => ({
              kind: 'receiver-error',
              receiver,
              ...receiverError(receiver, 'shuffle'),
            })),
            { kind: 'factory', providedSame: true, fnType: 'function' },
            {
              kind: 'task-return',
              type: 'test',
              name: 'manual child',
              mode: 'run',
              parent: 'raw suite',
              same: true,
              contextEnumerable: false,
            },
            { kind: 'beforeAll' },
            ...['manual', 'provided'].flatMap((label) => [
              {
                kind: 'beforeEach',
                name: `${label} child`,
                suite: 'raw suite',
              },
              {
                kind: `${label}-body`,
                name: `${label} child`,
                parent: 'raw suite',
              },
              { kind: 'afterEach', name: `${label} child`, suite: 'raw suite' },
            ]),
            { kind: 'afterAll' },
          ],
          collector: collector(['manual child', 'provided child']),
        },
      ])
      cases = passed([
        'raw suite manual child',
        'raw suite provided child',
        'root control',
      ])
      break
    case 'suite-queue': {
      const tasks = (published) =>
        ['ordinary child', 'raw child', 'outer leaf'].map((name, index) => ({
          type: index === 2 ? 'test' : published ? 'suite' : 'collector',
          name,
        }))
      const factories = (names) =>
        names.flatMap((name) =>
          ['start', 'end'].map((stage) => ({ kind: 'factory', name, stage }))
        )
      const bodies = [
        'ordinary leaf',
        'ordinary leaf',
        'raw leaf',
        'raw leaf',
        'outer leaf',
        'ordinary leaf',
        'raw leaf',
        'outer leaf',
        'sibling leaf',
      ]
      rows(actual, [
        {
          kind: 'suite-queue',
          trace: [
            ...factories(['outer', 'ordinary', 'raw child']),
            {
              kind: 'manual-complete',
              tasks: tasks(false),
              published: tasks(true),
            },
            ...factories([
              'outer',
              'ordinary',
              'raw child',
              'ordinary',
              'raw child',
            ]),
            { kind: 'factory', name: 'sibling' },
            ...bodies.map((name) => ({
              kind: 'body',
              name,
              parent: name.startsWith('ordinary')
                ? 'ordinary child'
                : name.startsWith('raw')
                  ? 'raw child'
                  : name.startsWith('outer')
                    ? 'outer'
                    : 'sibling',
            })),
          ],
          tasks: [...tasks(false), ...tasks(false)],
          published: [...tasks(true), ...tasks(true)],
        },
      ])
      cases = passed([
        ...bodies.map((name) =>
          name.startsWith('ordinary')
            ? `outer ordinary child ${name}`
            : name.startsWith('raw')
              ? `outer raw child ${name}`
              : name.startsWith('outer')
                ? `outer ${name}`
                : `sibling ${name}`
        ),
        'control',
      ])
      break
    }
    case 'task-scope': {
      const names = [
        'before',
        'extracted',
        'foreign-this',
        'inside-1',
        'after',
        'inside-2',
      ]
      const shapes = names.map(taskShape)
      const handler = (name) => ({ kind: 'handler-get', name })
      rows(actual, [
        {
          kind: 'suite-task-scope',
          trace: [
            ...names.slice(0, 3).map(handler),
            {
              kind: 'before-manual',
              staged: shapes.slice(0, 3),
              published: [],
            },
            { kind: 'factory', name: 'first', pass: 1 },
            handler('inside-1'),
            handler('after'),
            {
              kind: 'after-manual',
              staged: shapes.slice(0, 5),
              published: shapes.slice(0, 4),
            },
            { kind: 'factory', name: 'first', pass: 2 },
            handler('inside-2'),
            { kind: 'factory', name: 'second' },
            ...shapes.map(({ name, parent }) => ({
              kind: 'body',
              name,
              actual: name,
              parent,
              same: true,
              contextSame: true,
            })),
          ],
          handles: shapes.map((shape) => ({
            ...shape,
            sameSuite: shape.parent === 'first',
            contextSame: true,
            meta: { marker: shape.name },
          })),
          tasks: shapes,
          published: shapes,
        },
      ])
      cases = passed([
        ...shapes.map(({ name, parent }) =>
          parent ? `${parent} ${name}` : name
        ),
        'second second child',
        'control',
      ])
      break
    }
    case 'task-publish':
      rows(actual, [
        {
          kind: 'suite-task-publish',
          trace: [
            ...['first', 'second'].map((name) => ({ kind: 'factory', name })),
            { kind: 'root-before', name: 'inside', parent: 'first' },
            { kind: 'first-before', name: 'inside' },
            { kind: 'body', name: 'inside' },
            { kind: 'first-after', name: 'inside' },
            { kind: 'root-after', name: 'inside', parent: 'first' },
            { kind: 'root-before', name: 'second child', parent: 'second' },
            { kind: 'second-before', name: 'second child' },
            { kind: 'second-after', name: 'second child' },
            { kind: 'root-after', name: 'second child', parent: 'second' },
            { kind: 'root-before', name: 'control', parent: null },
            { kind: 'root-after', name: 'control', parent: null },
          ],
          lateRan: false,
          lateState: null,
          lateParent: 'second',
          staged: ['inside', 'late'],
          published: ['inside'],
        },
      ])
      cases = passed(['first inside', 'second second child', 'control'])
      break
    case 'task-context': {
      const fieldDescriptor = {
        enumerable: true,
        configurable: true,
        writable: true,
        getter: false,
        setter: false,
      }
      rows(actual, [
        {
          kind: 'suite-task-context',
          trace: [
            ...['outside', 'inside'].map((name) => ({
              kind: 'collection',
              name,
              ...contextFields,
              contextKeys: [
                'signal',
                'task',
                'skip',
                'annotate',
                'onTestFailed',
                'onTestFinished',
              ],
              signalDescriptor: fieldDescriptor,
              taskDescriptor: fieldDescriptor,
              methods: [
                'skip',
                'onTestFinished',
                'onTestFailed',
                'annotate',
              ].map((key) => ({
                key,
                type: 'function',
                name: '',
                length: key === 'annotate' ? 3 : 2,
              })),
            })),
            ...['outside', 'inside'].map((name) => ({
              kind: 'body',
              name,
              sameContext: true,
              taskIdentity: true,
              signalSame: true,
            })),
          ],
        },
      ])
      cases = passed(['outside', 'raw inside'])
      break
    }
    case 'task-context-positive':
      rows(actual, [
        {
          kind: 'task-context-positive',
          trace: [
            ...['outside', 'inside'].flatMap((name) => [
              {
                kind: 'collection',
                name,
                ...contextFields,
                contextName: 'context',
                contextLength: 0,
                assertionCalls: 0,
                done,
                skipFalse: { value: null },
                result: null,
              },
              { kind: 'collection-expect', name, assertionCalls: 1 },
            ]),
            ...['outside', 'inside'].flatMap((name) => [
              {
                kind: 'body',
                name,
                sameContext: true,
                contextType: 'function',
                taskIdentity: true,
                signalSame: true,
                expectSame: true,
                assertionCalls: 1,
                done,
              },
              {
                kind: 'body-finished',
                name,
                sameContext: true,
                taskIdentity: true,
                assertionCalls: 2,
              },
            ]),
          ],
          contexts: ['outside', 'inside'].map((name) => ({
            name,
            contextType: 'function',
            signalAborted: false,
            assertionCalls: 2,
          })),
        },
      ])
      cases = passed(['outside', 'raw inside'])
      break
    case 'task-context-signals': {
      const names = ['retried', 'deadline', 'after-deadline', 'repeated']
      const signal = (aborted) => ({
        signalAborted: aborted,
        signalReason: aborted ? timeout(100) : null,
      })
      const body = (name, turn, assertionCalls, aborted = false) => ({
        kind: 'body',
        name,
        turn,
        retry: name === 'repeated' ? 0 : turn,
        repeat: name === 'repeated' ? turn : 0,
        sameContext: true,
        taskIdentity: true,
        signalSame: true,
        expectSame: true,
        ...signal(aborted),
        assertionCalls,
      })
      const finish = (name, turn, assertionCalls, aborted = false) => ({
        kind: 'finished',
        name,
        turn,
        sameContext: true,
        signalSame: true,
        ...signal(aborted),
        assertionCalls,
      })
      rows(actual, [
        {
          kind: 'task-context-signals',
          trace: [
            ...names.map((name) => ({
              kind: 'collection',
              name,
              contextType: 'function',
              signalAborted: false,
              assertionCalls: 1,
            })),
            body('retried', 0, 1),
            finish('retried', 0, 2),
            body('retried', 1, 2),
            finish('retried', 1, 3),
            body('deadline', 0, 1),
            finish('deadline', 0, 1, true),
            body('deadline', 1, 1, true),
            { kind: 'late-body', name: 'deadline', ...signal(true) },
            finish('deadline', 1, 2, true),
            body('after-deadline', 0, 1),
            finish('after-deadline', 0, 3),
            body('repeated', 0, 1),
            finish('repeated', 0, 2),
            body('repeated', 1, 2),
            finish('repeated', 1, 3),
          ],
          contexts: names.map((name) => ({
            name,
            contextType: 'function',
            sameContext: true,
            ...signal(name === 'deadline'),
            assertionCalls: name === 'deadline' ? 2 : 3,
            state: 'pass',
          })),
        },
      ])
      cases = ['retried', 'deadline', 'after-deadline', 'signals repeated'].map(
        (name, index) => ({
          name,
          status: 'passed',
          failureCount: index < 2 ? 1 : 0,
        })
      )
      break
    }
    case 'task-context-handled':
    case 'task-context-late': {
      const handled = group === 'task-context-handled'
      const names = handled
        ? ['old-rejection']
        : ['old-rejection', 'old-local-assertion']
      rows(actual, [
        {
          kind: 'task-context-deadline-late',
          trace: names.flatMap((name, index) => [
            { kind: 'body', name, turn: 0, count: 0, aborted: false },
            { kind: 'finished', name, turn: 0, count: 0, state: 'fail' },
            { kind: 'body', name, turn: 1, count: 0, aborted: true },
            { kind: 'late-start', name, state: 'run' },
            ...(index === 1 ? [{ kind: 'late-action-ok', name }] : []),
            { kind: 'retry-end', name, count: index + 1 },
            {
              kind: 'finished',
              name,
              turn: 1,
              count: index + 1,
              state: 'pass',
            },
          ]),
          tasks: ['old-rejection', 'old-local-assertion'].map(
            (name, index) => ({
              name,
              state: handled && index === 1 ? null : 'pass',
              errors: handled && index === 1 ? [] : [timeout(60)],
            })
          ),
        },
      ])
      cases = ['old-rejection', 'old-local-assertion'].map((name, index) => ({
        name,
        status: handled && index === 1 ? 'skipped' : 'passed',
        failureCount: handled && index === 1 ? 0 : 1,
        ...(!handled
          ? { failureHeaders: [`Error: ${timeout(60).message}`] }
          : {}),
      }))
      break
    }
    default:
      return false
  }
  assertProfile(actual, cases)
  return true
}
