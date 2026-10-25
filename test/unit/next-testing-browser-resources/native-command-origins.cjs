const assert = require('node:assert/strict')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')
const artifact = {
  entryId: 'entry',
  revision: 'revision',
  client: { sourceFile: '/original/commands.test.mjs' },
}
const collector = createClientResultCollector(artifact, {
  runId: 'run',
  caseScheduling: 'concurrent-v1',
})
const context = (retry = 0) => ({
  id: `run/entry/0/${retry}/0`,
  fileId: 'entry',
  testId: 'entry/0',
  name: 'A',
  retry,
  repeat: 0,
})
const origin = (retry = 0) => ({
  fileId: 'entry',
  caseId: 'entry/0',
  attempt: { id: context(retry).id, retry, repeat: 0 },
})
let controls = 0
const reject = (value, owner = collector) => {
  assert.throws(
    () => owner.assertLiveCommandOrigin(value),
    /Invalid Browser Mode native command owner/
  )
  controls++
}
reject(origin())
collector.accept({
  type: 'collected',
  declarations: [
    {
      type: 'suite',
      id: 'entry',
      parentId: null,
      name: '',
      mode: 'run',
      concurrent: false,
    },
    {
      type: 'test',
      id: 'entry/0',
      parentId: 'entry',
      name: 'A',
      mode: 'run',
      concurrent: false,
    },
  ],
})
collector.accept({ type: 'case-start', context: context() })
collector.assertLiveCommandOrigin(origin())
for (const invalid of [
  { ...origin(), fileId: 'foreign' },
  { ...origin(), caseId: 'entry/1' },
  { ...origin(), attempt: { ...origin().attempt, id: 'forged' } },
  { ...origin(), attempt: { ...origin().attempt, retry: 1 } },
  { ...origin(), attempt: { ...origin().attempt, repeat: 1 } },
  { ...origin(), attempt: { id: origin().attempt.id, retry: 0 } },
  { ...origin(), attempt: { ...origin().attempt, retry: -1 } },
  { ...origin(), attempt: { ...origin().attempt, retry: NaN } },
  { ...origin(), extra: true },
  { ...origin(), attempt: { ...origin().attempt, extra: true } },
  null,
])
  reject(invalid)
collector.assertLiveCommandOrigin(origin())
collector.accept({
  type: 'case-end',
  result: {
    entryId: 'entry',
    caseId: 'entry/0',
    attempt: origin().attempt,
    name: 'A',
    testName: 'A',
    ancestors: [],
    mode: 'run',
    status: 'failed',
    durationMs: 1,
    errors: [
      { phase: 'test', error: { name: 'Error', message: 'original failure' } },
    ],
  },
})
reject(origin())
collector.accept({ type: 'case-start', context: context(1) })
collector.assertLiveCommandOrigin(origin(1))
reject(origin())
reject(
  origin(),
  createClientResultCollector(artifact, {
    runId: 'run',
  })
)
assert.equal(controls, 15)
process.stdout.write(
  JSON.stringify({
    controls,
    exactLiveAttemptOnly: true,
    closedAndPreviousRetriesRejected: true,
    malformedOriginsRejected: true,
    legacyProfileUnchanged: true,
  }) + '\n'
)
