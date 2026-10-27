const assert = require('node:assert/strict')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')
const {
  isReportedSuiteError,
} = require('next/dist/experimental/testing/reporting/custom-reporter-tasks')
const mode = process.argv[2]
assert(
  [
    'valid',
    'legacy',
    'changed-name',
    'changed-stack',
    'shared-stages',
    'future',
    'unknown',
    'negative',
    'fractional',
    'absent-slot',
    'repeated',
    'cleanup-owner',
  ].includes(mode)
)
const profile = {
  id: 'browser-suite',
  environment: 'browser',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const artifact = {
  version: 2,
  kind: 'browser',
  entryId: 'entry',
  revision: 'revision',
  sourceHash: 'a'.repeat(64),
  profile,
  client: { sourceFile: '/project/suite.test.mjs', scripts: [], styles: [] },
  files: [],
}
const collector = createClientResultCollector(artifact, { runId: 'run' })
const error = {
  name: 'FixtureCleanupError',
  message: 'same actual suite error',
  stack: '',
}
collector.accept({
  type: 'collected',
  declarations: [
    { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
  ],
})
const result = {
  entryId: 'entry',
  suiteId: 'entry',
  name: '',
  ancestors: [],
  mode: 'run',
  status: 'failed',
  durationMs: 0,
  errors: [{ phase: 'cleanup', error }],
}
const message = {
  type: 'failure',
  error,
  ...(mode === 'legacy' ? {} : { suiteError: { suiteId: 'entry', index: 0 } }),
}
if (mode === 'future') {
  assert.throws(
    () => collector.accept(message),
    /Invalid Browser Mode reported suite failure/
  )
} else {
  collector.accept({ type: 'suite-end', result })
  if (mode === 'unknown') message.suiteError.suiteId = 'other'
  if (mode === 'negative') message.suiteError.index = -1
  if (mode === 'fractional') message.suiteError.index = 0.5
  if (mode === 'absent-slot') message.suiteError.index = 1
  if (mode === 'cleanup-owner') message.origin = 'component-cleanup'
  const invalid = [
    'unknown',
    'negative',
    'fractional',
    'absent-slot',
    'cleanup-owner',
  ].includes(mode)
  if (invalid)
    assert.throws(
      () => collector.accept(message),
      /Invalid Browser Mode reported suite failure/
    )
  else {
    if (mode === 'changed-name')
      message.error = { ...error, name: 'ChangedName' }
    if (mode === 'changed-stack')
      message.error = { ...error, stack: 'different final serializer stack' }
    collector.accept(message)
    if (mode === 'repeated')
      assert.throws(
        () => collector.accept(message),
        /Repeated Browser Mode reported suite failure/
      )
    if (mode === 'shared-stages')
      for (const origin of ['component-cleanup', 'worker-fixture-cleanup'])
        collector.accept({ type: 'failure', error, origin })
    const diagnostics = collector.events.filter(
      (event) => event.type === 'diagnostic'
    )
    assert.equal(diagnostics.length, mode === 'shared-stages' ? 3 : 1)
    assert.equal(
      isReportedSuiteError(diagnostics[0], collector.events),
      !['legacy', 'changed-name', 'changed-stack'].includes(mode)
    )
    if (mode === 'shared-stages') {
      assert.deepEqual(
        diagnostics.slice(1).map((event) => event.diagnostic.runError),
        ['browser-component-cleanup', 'browser-worker-fixture-cleanup']
      )
      assert(
        diagnostics.slice(1).every((event) => event.suiteError === undefined)
      )
    }
    const before = JSON.stringify(collector.events)
    for (const event of diagnostics)
      isReportedSuiteError(event, collector.events)
    assert.equal(JSON.stringify(collector.events), before)
  }
}
process.stdout.write(
  JSON.stringify({
    mode,
    exactPrecedingSuiteSlotOnly: true,
    allDiagnosticOccurrencesRetained: true,
    completeFieldComparisonHeld: true,
  }) + '\n'
)
