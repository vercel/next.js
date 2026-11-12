import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const {
  getCollectionTaskView,
} = require('next/dist/experimental/testing/runner/tasks')
const {
  assertUnexecutedCaseResult,
} = require('next/dist/experimental/testing/reporting/unexecuted-cases')
const {
  createTestReporter,
} = require('next/dist/experimental/testing/reporting/reporter')
const [mode, output] = process.argv.slice(2)
if (mode === 'validation') {
  const valid = {
    entryId: 'file',
    caseId: 'case',
    attempt: { id: 'unexecuted', retry: 0, repeat: 0 },
    mode: 'run',
    status: 'skipped',
    durationMs: 0,
    errors: [],
    unexecuted: true,
  }
  assert.equal(assertUnexecutedCaseResult(valid), true)
  assert.equal(
    assertUnexecutedCaseResult({ ...valid, unexecuted: undefined }),
    false
  )
  const invalid = [
    { unexecuted: false },
    { unexecuted: 'true' },
    { mode: 'skip' },
    { status: 'passed' },
    { pending: true },
    { pending: false },
    { bail: true },
    { bail: false },
    { note: 'unexecuted' },
    { durationMs: 1 },
    { errors: [new Error('real failure')] },
    { attempt: { id: 'retry', retry: 1, repeat: 0 } },
    { attempt: { id: 'repeat', retry: 0, repeat: 1 } },
    { attempt: { retry: 0, repeat: 0 } },
  ]
  for (const fields of invalid)
    assert.throws(
      () => assertUnexecutedCaseResult({ ...valid, ...fields }),
      /Invalid actual unexecuted case result/
    )
  const reporter = createTestReporter({
    projectDir: '/owned',
    write: () => {},
    writeError: () => {},
  })
  const event = (value) =>
    reporter.onEvent({ version: 1, runId: 'owned', timestamp: 1, ...value })
  event({ type: 'run-start' })
  event({
    type: 'case-start',
    entryId: 'file',
    caseId: 'case',
    attempt: { id: 'different-actual-attempt', retry: 0, repeat: 0 },
    name: 'actual start',
    mode: 'run',
  })
  assert.throws(
    () => event({ type: 'case-end', ...valid, name: 'same declaration' }),
    /follows an actual attempt/
  )
  await reporter.dispose()
  writeFileSync(
    output,
    JSON.stringify({
      mode,
      invalidShapesRejected: invalid.length,
      actualStartCannotBecomeUnexecuted: true,
    }) + '\n'
  )
  process.exit(0)
}
const c = createCollector('owned:unexecuted'),
  effects = [],
  starts = [],
  ends = [],
  logical = []
const controller = new AbortController(),
  userController = new AbortController()
const blockedError = new Error('owned beforeAll error')
c.api.beforeAll(() => {
  effects.push('before-all')
  if (mode === 'blocked') throw blockedError
})
c.api.afterAll(() => effects.push('after-all'))
if (mode === 'static') {
  c.api.test.skip('explicit skip', () => effects.push('BAD_BODY'))
  c.api.test.todo('explicit todo')
} else if (mode === 'dynamic')
  c.api.test('dynamic', (context) => {
    effects.push('dynamic-body')
    context.skip()
  })
else {
  if (mode === 'bail')
    c.api.test('fails first', () => {
      effects.push('fails')
      throw new Error('owned case failure')
    })
  if (mode === 'poisoned')
    c.api.test('times out first', { timeout: 1 }, () => {
      effects.push('times-out')
      return new Promise(() => {})
    })
  if (mode === 'mixed' || mode === 'blocked')
    c.api.test('runs', () => effects.push('runs'))
  if (mode === 'focus')
    c.api.test.only('focused', () => effects.push('focused'))
  const outer = mode === 'todo-skip' ? 'todo' : 'skip',
    inner = outer === 'skip' ? 'todo' : 'skip'
  c.api.describe[outer]('outer', () =>
    c.api.describe[inner]('explicit excluded', () =>
      c.api.describe('implicit', () => {
        c.api.beforeAll(() => effects.push('BAD_BEFORE'))
        c.api.afterAll(() => effects.push('BAD_AFTER'))
        c.api.test('untouched', () => effects.push('BAD_BODY'))
      })
    )
  )
}
await c.settle()
const root = c.close(),
  cached = new Map(),
  declarations = new Map()
function remember(node) {
  cached.set(
    node,
    getCollectionTaskView(root, node, {
      filePath: '/owned/unexecuted.case.mjs',
      testTimeout: 10000,
    })
  )
  declarations.set(node, node.mode)
  if (node.type === 'suite') node.children.forEach(remember)
}
remember(root)
if (mode === 'abort') controller.abort(new Error('owned abort'))
if (mode === 'user-abort') userController.abort(new Error('owned user cancel'))
const result = await runCollected(
  root,
  {
    runId: 'owned-unexecuted',
    signal: controller.signal,
    userCancelSignal: userController.signal,
    filePath: '/owned/unexecuted.case.mjs',
    ...(mode === 'absent'
      ? {}
      : { finalizePublicTaskModes: mode === 'truthy' ? 'true' : true }),
    ...(mode === 'filter' ? { testNamePattern: 'never' } : {}),
    ...(mode === 'bail' ? { bail: 1 } : {}),
    onCaseStart(context) {
      starts.push(context.testId)
    },
    onCaseEnd(value) {
      assertUnexecutedCaseResult(value)
      ends.push(value)
    },
    onCaseResult(task, value) {
      assertUnexecutedCaseResult(value)
      logical.push({ task, value, result: task.result, mode: task.mode })
    },
  },
  () => {}
)
for (const [node, original] of declarations) {
  assert.equal(node.mode, original)
  assert.equal(
    getCollectionTaskView(root, node, {
      filePath: '/owned/unexecuted.case.mjs',
      testTimeout: 10000,
    }),
    cached.get(node)
  )
}
if (['skip-todo', 'todo-skip', 'mixed'].includes(mode)) {
  const untouched = logical.find((value) => value.task.name === 'untouched')
  assert(untouched)
  assert.equal(untouched.value.unexecuted, true)
  assert.equal(untouched.value.mode, 'run')
  assert.equal(untouched.value.status, 'skipped')
  assert.equal(untouched.value.durationMs, 0)
  assert.equal(untouched.value.attempt.retry, 0)
  assert.equal(untouched.value.attempt.repeat, 0)
  assert.equal(untouched.result, undefined)
  assert.equal(untouched.mode, 'run')
  assert.equal(starts.includes(untouched.task.id), false)
  assert.equal(
    ends.find((value) => value.caseId === untouched.task.id),
    untouched.value
  )
  assert.equal(
    result.cases.find((value) => value.caseId === untouched.task.id),
    untouched.value
  )
  assert.deepEqual(untouched.value.errors, [])
  assert.deepEqual(
    effects,
    mode === 'mixed' ? ['before-all', 'runs', 'after-all'] : []
  )
  assert.equal(starts.length, mode === 'mixed' ? 1 : 0)
  assert.equal(result.errors.length, 0)
} else {
  assert(result.cases.every((value) => value.unexecuted === undefined))
  if (mode === 'dynamic') {
    assert.equal(starts.length, 1)
    assert.equal(result.cases[0].pending, true)
    assert.equal(result.cases[0].mode, 'skip')
    assert.deepEqual(effects, ['before-all', 'dynamic-body', 'after-all'])
  } else if (mode === 'bail' || mode === 'poisoned') {
    assert.equal(starts.length, 1)
    assert.equal(result.cases[0].status, 'failed')
    assert.equal(
      effects.some((effect) => effect.startsWith('BAD_')),
      false
    )
    if (mode === 'poisoned') assert.equal(result.interrupted, true)
  } else if (mode === 'focus')
    assert.deepEqual(effects, ['before-all', 'focused', 'after-all'])
  else if (mode === 'blocked') {
    assert.equal(starts.length, 0)
    assert.equal(
      result.errors.some((failure) => failure.error === blockedError),
      true
    )
    assert.deepEqual(effects, ['before-all', 'after-all'])
  } else {
    assert.equal(starts.length, 0)
    assert.deepEqual(effects, [])
  }
  if (mode === 'abort') assert.equal(result.interrupted, true)
}
writeFileSync(
  output,
  JSON.stringify({
    mode,
    starts,
    caseFacts: ends.map(
      ({ caseId, mode, status, pending, unexecuted, durationMs, attempt }) => ({
        caseId,
        mode,
        status,
        pending,
        unexecuted,
        durationMs,
        attempt,
      })
    ),
    logicalCallbacks: logical.length,
    effects,
    cachedIdentitiesAndPrivateDeclarationsHeld: true,
  }) + '\n'
)
