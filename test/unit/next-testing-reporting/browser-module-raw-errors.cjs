const assert = require('node:assert/strict')
const {
  createCustomReporterModules,
} = require('next/dist/experimental/testing/reporting/custom-reporter-tasks')
const {
  createLiveReporterTaskStore,
} = require('next/dist/experimental/testing/reporting/custom-reporter-live-tasks')
const modes = [
  'raw-fields',
  'absent-pass',
  'absent-case-failure',
  'empty-aggregate',
  'independent-compilation',
  'independent-cleanup',
  'independent-capture',
  'independent-late',
  'independent-same-value',
  'changed-owned-fields',
  'no-final-pack',
  'missing-final-result',
  'pending-final-result',
  'child-only-pack',
  'wrong-root',
  'wrong-entry',
  'wrong-revision',
  'wrong-run',
  'node-role',
  'missing-start-revision',
  'collected-only',
  'later-child-pack',
]
for (const mode of modes) {
  const profile = {
    id: 'browser-suite',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  }
  const entry = { id: 'entry', file: '/project/suite.test.mjs', profile }
  const base = { version: 1, runId: 'run', timestamp: 0 }
  const start = {
    ...base,
    type: 'file-start',
    entry,
    revision: 'revision',
  }
  const raw = {
    name: 'CustomFixtureError',
    message: 'actual raw root failure',
    stack: '',
    code: 'FIXTURE_CODE',
    payload: { retained: [1, { value: 2 }] },
    cause: { name: 'CauseError', message: 'retained cause', stack: '' },
    constructor: 'Function<Error>',
    toString: 'Function<toString>',
    stacks: [],
  }
  const diagnostic = {
    name: raw.name,
    message: raw.message,
    stack: '',
    frames: [],
    phase: 'runtime',
    severity: 'error',
  }
  const suite = {
    ...base,
    type: 'suite-end',
    entryId: entry.id,
    revision: 'revision',
    suiteId: entry.id,
    name: '',
    ancestors: [],
    mode: 'run',
    status: 'failed',
    durationMs: 0,
    errors: [diagnostic],
  }
  const tree = {
    id: entry.id,
    type: 'suite',
    name: 'suite.test.mjs',
    fullName: 'suite.test.mjs',
    parentSuiteId: null,
    mode: 'run',
    meta: {},
    tags: [],
    tasks: [],
    filepath: entry.file,
    projectName: profile.id,
    result: { state: 'fail', errors: [raw] },
  }
  const collectedTree = structuredClone(tree)
  delete collectedTree.result
  const update = {
    ...base,
    type: 'task-update',
    entryId: entry.id,
    revision: 'revision',
    taskTree: tree,
    taskUpdateIds: [entry.id],
    caseResults: [],
  }
  const owned = {
    ...base,
    type: 'diagnostic',
    entryId: entry.id,
    revision: 'revision',
    suiteError: { suiteId: entry.id, index: 0 },
    diagnostic,
  }
  let expected = [raw]
  const events = [start, suite, update, owned]
  const file = {
    ...base,
    type: 'file-end',
    entryId: entry.id,
    status: 'failed',
    durationMs: 0,
  }
  if (mode === 'absent-pass' || mode === 'absent-case-failure') {
    tree.result = { state: mode === 'absent-pass' ? 'pass' : 'fail' }
    suite.errors = []
    events.pop()
    if (mode === 'absent-pass') {
      suite.status = 'passed'
      file.status = 'passed'
    }
    expected = []
  } else if (mode === 'empty-aggregate') {
    tree.result.errors = []
    expected = []
  } else if (mode.startsWith('independent-')) {
    const other =
      mode === 'independent-same-value'
        ? structuredClone(diagnostic)
        : {
            phase:
              mode === 'independent-cleanup'
                ? 'cleanup'
                : mode === 'independent-compilation'
                  ? 'compilation'
                  : 'runtime',
            severity: 'error',
            message: mode,
          }
    events.push({
      ...base,
      type: 'diagnostic',
      entryId: entry.id,
      revision: 'revision',
      diagnostic: other,
    })
    expected.push(other)
  } else if (mode === 'changed-owned-fields') {
    owned.diagnostic = { ...diagnostic, stack: 'changed independent fields' }
    expected.push(owned.diagnostic)
  } else if (mode === 'later-child-pack') {
    events.push({
      ...update,
      taskTree: {
        ...tree,
        result: { state: 'fail', errors: [{ message: 'unowned root copy' }] },
      },
      taskUpdateIds: ['entry/child'],
    })
  } else {
    if (mode === 'no-final-pack') events.splice(2, 1)
    if (mode === 'missing-final-result') delete tree.result
    if (mode === 'pending-final-result') tree.result.state = 'run'
    if (mode === 'child-only-pack') update.taskUpdateIds = ['entry/child']
    if (mode === 'wrong-root') tree.id = 'other'
    if (mode === 'wrong-entry') update.entryId = 'other'
    if (mode === 'wrong-revision') update.revision = 'other'
    if (mode === 'wrong-run') update.runId = 'other'
    if (mode === 'node-role') delete profile.browserClient
    if (mode === 'missing-start-revision') delete start.revision
    if (mode === 'collected-only') {
      update.type = 'file-collected'
      delete update.taskUpdateIds
      delete update.caseResults
    }
    if (mode !== 'raw-fields') expected = [diagnostic]
  }
  events.push(file)
  const completion = {
    entries: [start],
    files: [file],
    suites: [suite],
    cases: [],
    events,
    status: file.status,
  }
  const before = structuredClone(completion)
  const module = createCustomReporterModules('/project', completion)[0]
  assert.deepEqual(module.errors(), expected, mode + ' exact ordered data')
  assert.equal(module.state(), file.status, mode + ' physical state')
  assert.equal(
    module.ok(),
    file.status !== 'failed',
    mode + ' physical failure'
  )
  const live = createLiveReporterTaskStore('/project')
  live.update(collectedTree)
  const collectedModule = live.get(entry.id)
  const finished = live.finishModule(entry.id, completion)
  assert.equal(
    finished,
    collectedModule,
    mode + ' retained live module identity'
  )
  assert.deepEqual(
    finished.errors(),
    expected,
    mode + ' live ordered error data'
  )
  assert.equal(finished.state(), file.status, mode + ' live physical state')
  assert.equal(
    finished.ok(),
    file.status !== 'failed',
    mode + ' live physical failure'
  )
  assert.deepEqual(completion, before, mode + ' original event facts')
}
process.stdout.write(
  JSON.stringify({
    comparisons: modes.length * 2,
    actualRootPackAndRevisionOnly: true,
    absentErrorsDistinctFromNoSnapshot: true,
    emptyArrayCannotPassFailedFile: true,
    independentOccurrencesAndCompleteComparison: true,
    nodeAndLegacyFallbackUnchanged: true,
    receivedFactsUnchanged: true,
    liveModuleIdentityRetained: true,
    liveAndCompletionSelectorsAgree: true,
  }) + '\n'
)
