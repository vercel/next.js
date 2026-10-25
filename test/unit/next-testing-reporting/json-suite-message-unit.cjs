const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const corpus = path.join(__dirname, 'fixtures/json-suite-file-message')
function renderVectors(packageDir) {
  const { createMachineReporter } = require(
    path.join(packageDir, 'dist/experimental/testing/reporting/machine')
  )
  const vectors = JSON.parse(
    fs.readFileSync(path.join(corpus, 'unit-vectors.json'), 'utf8')
  )
  const entry = {
    id: 'unit:entry',
    file: '/project/contract.case.mjs',
    profile: {
      id: 'unit',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  const output = []
  for (const vector of vectors)
    for (const historical of [false, true]) {
      const machine = createMachineReporter({
        projectDir: '/project',
        reporters: ['json', 'junit'],
      })
      const emit = (event) =>
        machine.onEvent({
          version: 1,
          runId: 'original',
          timestamp: 100,
          revision: 'unit-revision',
          ...event,
        })
      emit({ type: 'run-start' })
      emit({ type: 'file-start', entry })
      emit({
        type: 'case-end',
        entryId: entry.id,
        caseId: 'body',
        attempt: { id: 'attempt', retry: 0, repeat: 0 },
        name: 'body',
        testName: 'body',
        status: 'passed',
        durationMs: 0,
        errors: [],
      })
      const suiteId = vector.scope === 'root' ? entry.id : 'nested'
      if (vector.scope === 'nested')
        emit({
          type: 'suite-end',
          entryId: entry.id,
          suiteId: 'nested',
          name: 'nested',
          ancestors: [],
          mode: 'run',
          status: 'failed',
          durationMs: 0,
          errors: vector.errors,
        })
      emit({
        type: 'suite-end',
        entryId: entry.id,
        suiteId: entry.id,
        name: 'file',
        ancestors: [],
        mode: 'run',
        status:
          vector.scope === 'root' && vector.errors.length ? 'failed' : 'passed',
        durationMs: 0,
        errors: vector.scope === 'root' ? vector.errors : [],
      })
      for (const diagnostic of vector.diagnostics)
        emit({
          type: 'diagnostic',
          entryId: entry.id,
          diagnostic: diagnostic.error,
          ...(diagnostic.index === undefined
            ? {}
            : { suiteError: { suiteId, index: diagnostic.index } }),
          ...(diagnostic.revision ? { revision: diagnostic.revision } : {}),
        })
      const status = vector.name === 'warning' ? 'passed' : 'failed'
      emit({ type: 'file-end', entryId: entry.id, status, durationMs: 0 })
      emit({ type: 'run-end', status, durationMs: 0 })
      let active = machine,
        record
      if (historical) {
        record = machine.snapshotClosedFiles(new Set([entry.id]))[0]
        assert(record)
        active = createMachineReporter({
          projectDir: '/project',
          reporters: ['json', 'junit'],
        })
        active.onEvent({
          version: 1,
          runId: 'current',
          timestamp: 200,
          type: 'run-start',
        })
        active.retainUnexecutedFiles([entry], [record], [entry.id])
        active.onEvent({
          version: 1,
          runId: 'current',
          timestamp: 200,
          type: 'run-end',
          status: 'passed',
          durationMs: 0,
        })
      }
      const original = record ? JSON.stringify(record) : undefined
      const rawEvents = JSON.stringify(active.getJson().next.events)
      const json = active.getJson(),
        junit = active.getJUnit()
      assert.equal(JSON.stringify(json.next.events), rawEvents)
      if (record) assert.equal(JSON.stringify(record), original)
      if (historical)
        assert(json.next.events.every((event) => event.runId === 'current'))
      output.push({
        name: vector.name + (historical ? '-history' : '-current'),
        expectedMessage: vector.message,
        message: json.testResults[0].message,
        junit,
        originalEvidenceHeld: true,
      })
      if (active !== machine) active.dispose()
      machine.dispose()
    }
  return output
}
module.exports = { renderVectors }
if (require.main === module) {
  const packageDir = fs.realpathSync(
    process.argv[2] ?? path.join(__dirname, '../../../packages/next')
  )
  const rows = renderVectors(packageDir),
    expected = JSON.parse(
      fs.readFileSync(path.join(corpus, 'prior-junit.json'), 'utf8')
    )
  for (const row of rows) {
    assert.equal(row.message, row.expectedMessage, row.name)
    assert.equal(row.junit, expected[row.name], row.name)
  }
  process.stdout.write(
    JSON.stringify({
      scenarios: rows.length,
      exactRawMessages: true,
      priorJUnitBytesHeld: true,
      originalEvidenceHeld: true,
      closedHistoryOwnedSlots: true,
    }) + '\n'
  )
}
