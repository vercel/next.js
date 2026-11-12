const assert = require('node:assert/strict')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')
const {
  clientCaseFinal,
} = require('next/dist/experimental/testing/client/protocol')
const root = {
  type: 'suite',
  id: 'entry',
  parentId: null,
  name: '',
  mode: 'run',
  concurrent: false,
}
const definitions = ['A', 'B'].map((name, index) => ({
  type: 'test',
  id: `entry/${index}`,
  parentId: 'entry',
  name,
  mode: 'run',
  concurrent: true,
}))
const context = (index, retry = 0, repeat = 0) => ({
  id: `run/entry/${index}/${retry}/${repeat}`,
  fileId: 'entry',
  testId: `entry/${index}`,
  name: definitions[index].name,
  retry,
  repeat,
})
const result = (index, status = 'passed', retry = 0, repeat = 0) => ({
  entryId: 'entry',
  caseId: `entry/${index}`,
  attempt: { id: context(index, retry, repeat).id, retry, repeat },
  name: definitions[index].name,
  testName: definitions[index].name,
  ancestors: [],
  mode: 'run',
  status,
  durationMs: 1,
  errors:
    status === 'failed'
      ? [
          {
            phase: 'assertion',
            error: {
              name: 'Error',
              message: 'original retry failure',
              stack: '',
            },
          },
        ]
      : [],
})
function create(extra = {}) {
  const collector = createClientResultCollector(
    {
      entryId: 'entry',
      revision: 'revision',
      client: { sourceFile: '/original/cases.test.mjs' },
    },
    {
      runId: 'run',
      maxConcurrency: 2,
      caseScheduling: 'concurrent-v1',
      ...extra,
    }
  )
  collector.accept({ type: 'collected', declarations: [root, ...definitions] })
  return collector
}
const start = (collector, index, retry = 0, repeat = 0) =>
  collector.accept({
    type: 'case-start',
    context: context(index, retry, repeat),
  })
const end = (collector, value) =>
  collector.accept({ type: 'case-end', result: value })
const final = (collector, value) =>
  collector.accept({ type: 'case-final', result: clientCaseFinal(value) })
const suite = (collector) =>
  collector.accept({
    type: 'suite-end',
    result: {
      entryId: 'entry',
      suiteId: 'entry',
      name: '',
      ancestors: [],
      mode: 'run',
      status: 'passed',
      durationMs: 1,
      errors: [],
    },
  })
const complete = (collector) =>
  collector.accept({
    type: 'complete',
    status: 'passed',
    interrupted: false,
    caseCount: 2,
    updates: [],
  })
let controls = 0
for (const order of [
  [0, 1],
  [1, 0],
]) {
  const collector = create()
  start(collector, 0)
  start(collector, 1)
  for (const index of order) {
    end(collector, result(index))
    final(collector, result(index))
  }
  suite(collector)
  complete(collector)
  assert.equal(collector.result().status, 'passed')
  controls++
}
{
  const collector = create()
  start(collector, 0)
  start(collector, 1)
  end(collector, result(0, 'failed'))
  start(collector, 0, 1)
  end(collector, result(1))
  final(collector, result(1))
  end(collector, result(0, 'passed', 1))
  final(collector, result(0, 'passed', 1))
  suite(collector)
  complete(collector)
  assert.equal(collector.result().status, 'passed')
  controls++
}
for (const variation of [
  'unknown',
  'live',
  'status',
  'ordinal',
  'extra',
  'duplicate',
]) {
  const collector = create()
  start(collector, 0)
  if (variation !== 'live') end(collector, result(0))
  const value = clientCaseFinal(result(0))
  if (variation === 'unknown') value.caseId = 'entry/unknown'
  if (variation === 'status') value.status = 'failed'
  if (variation === 'ordinal') value.attempt.retry = 1
  if (variation === 'extra') value.taskId = 'mutable-public-field'
  if (variation === 'duplicate') final(collector, result(0))
  assert.throws(
    () => collector.accept({ type: 'case-final', result: value }),
    /Invalid Browser Mode final case/
  )
  controls++
}
{
  const collector = create()
  start(collector, 0)
  end(collector, result(0))
  start(collector, 1)
  end(collector, result(1))
  assert.throws(() => suite(collector), /omitted declared descendants/)
  assert.throws(() => complete(collector), /omitted declared tasks/)
  controls++
}
{
  const collector = create()
  start(collector, 0)
  assert.throws(() => start(collector, 0), /Invalid or duplicate/)
  assert.throws(
    () => end(collector, result(1)),
    /Browser Mode case result does not match its immutable attempt/
  )
  controls++
}
{
  let reads = 0
  const value = result(0, 'failed')
  Object.defineProperty(value, 'errors', {
    get() {
      reads++
      throw new Error('Do not inspect Errors for logical closure')
    },
  })
  assert.deepEqual(clientCaseFinal(value), {
    caseId: 'entry/0',
    attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
    status: 'failed',
    mode: 'run',
  })
  assert.equal(reads, 0)
  controls++
}
for (const capability of [false, true]) {
  const collector = create(
    capability ? { isUserCancellationFinalized: () => true } : {}
  )
  const skipped = { ...result(0, 'skipped'), errors: [] }
  if (!capability)
    assert.throws(
      () => end(collector, skipped),
      /does not match its immutable attempt/
    )
  else {
    end(collector, skipped)
    final(collector, skipped)
    const second = { ...result(1, 'skipped'), errors: [] }
    end(collector, second)
    final(collector, second)
    suite(collector)
    collector.accept({
      type: 'complete',
      status: 'passed',
      interrupted: true,
      caseCount: 2,
      updates: [],
    })
    assert.equal(collector.result().status, 'passed')
  }
  controls++
}
{
  const collector = create({ isUserCancellationFinalized: () => false })
  for (const index of [0, 1]) {
    const skipped = { ...result(index, 'skipped'), errors: [] }
    end(collector, skipped)
    final(collector, skipped)
  }
  suite(collector)
  assert.throws(
    () =>
      collector.accept({
        type: 'complete',
        status: 'passed',
        interrupted: true,
        caseCount: 2,
        updates: [],
      }),
    /omitted declared tasks/
  )
  controls++
}
process.stdout.write(
  JSON.stringify({
    controls,
    bothEndOrders: true,
    independentRetry: true,
    invalidFinalsRejected: true,
    noExtraErrorReads: true,
  }) + '\n'
)
