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
  createReporterTaskUpdates,
} = require('next/dist/experimental/testing/reporting/task-updates')
const [mode, output] = process.argv.slice(2)
const c = createCollector('owned:module-start'),
  trace = [],
  packs = []
const requested = !['absent', 'truthy'].includes(mode)
let bodies = 0,
  actualFile,
  preparedResult,
  prepared = 0,
  preparedState,
  metaReads = 0
const fault =
  mode === 'snapshot-undefined' ? undefined : new Error('owned ' + mode)
if (mode !== 'empty') {
  const declare = mode === 'skip' ? c.api.test.skip : c.api.test
  declare('actual body', () => {
    bodies++
    trace.push('body')
  })
}
c.api.beforeAll(() => trace.push('before-all'))
c.api.afterAll(() => {
  trace.push('after-all')
  if (mode === 'cleanup-failure') throw fault
})
const updates = createReporterTaskUpdates({
  ...(requested ? { captureModuleStart: true } : {}),
  onUpdate(update) {
    packs.push(update)
    trace.push('pack:' + update.taskTree.result?.state)
    if (mode === 'send-failure') throw fault
  },
})
let rejected = false,
  reason,
  result
try {
  result = await runCollected(
    c.close(),
    {
      runId: 'owned-module-start-run',
      filePath: '/owned/module-start.case.mjs',
      signal: new AbortController().signal,
      prepareEmptyPublicFile: true,
      finalizePublicTaskModes: true,
      ...(mode === 'absent'
        ? {}
        : { captureModuleStart: mode === 'truthy' ? 'true' : true }),
      onCollected(file) {
        actualFile = file
        trace.push('collected')
        const meta = file.meta
        Object.defineProperty(file, 'meta', {
          configurable: true,
          get() {
            metaReads++
            return meta
          },
        })
        updates.collected(file)
        if (requested) assert.equal(packs.length, 0)
        if (mode === 'foreign')
          assert.throws(
            () => updates.filePrepared({ ...file }),
            /actual prepared File/
          )
        if (mode === 'missing') {
          assert.throws(
            () => updates.caseStart(file.tasks[0].id),
            /before actual File preparation/
          )
          assert.throws(
            () =>
              updates.caseResult(file.tasks[0], { caseId: file.tasks[0].id }),
            /before actual File preparation/
          )
          assert.throws(
            () => updates.suiteEnd(file),
            /before actual File preparation/
          )
        }
      },
      prepareSnapshots() {
        trace.push('snapshot')
        if (mode === 'snapshot-error' || mode === 'snapshot-undefined')
          throw fault
      },
      onFilePrepared(file) {
        assert.equal(file, actualFile)
        assert(file.result)
        preparedResult = file.result
        preparedState = file.result.state
        prepared++
        trace.push('prepared:' + file.result.state)
        updates.filePrepared(file)
        if (mode === 'duplicate')
          assert.throws(
            () => updates.filePrepared(file),
            /actual prepared File/
          )
        if (mode === 'observer-failure') throw fault
      },
      onCaseStart(context) {
        trace.push('case-start')
        if (requested) updates.caseStart(context.testId)
      },
      onCaseResult(task, result) {
        updates.caseResult(task, result)
      },
      onSuiteEnd(_, task) {
        trace.push('suite-end')
        updates.suiteEnd(task)
      },
    },
    () => {},
    {
      beginFileFixtures() {
        trace.push('assertion-scope')
        return {
          finalize() {
            trace.push('assertion-finalize')
          },
          dispose() {
            trace.push('assertion-dispose')
          },
        }
      },
      beginHook() {
        return { finalize() {}, dispose() {} }
      },
      setActiveHook() {},
    }
  )
} catch (error) {
  rejected = true
  reason = error
}
let updateRejected = false,
  updateReason
try {
  await updates.finish()
} catch (error) {
  updateRejected = true
  updateReason = error
}
updates.dispose()
if (mode === 'snapshot-error' || mode === 'snapshot-undefined') {
  assert(rejected)
  assert.equal(reason, fault)
  assert.equal(prepared, 0)
  assert.equal(bodies, 0)
  assert.equal(packs.length, 0)
} else if (mode === 'observer-failure') {
  assert(rejected)
  assert.equal(reason, fault)
  assert.equal(prepared, 1)
  assert.equal(bodies, 0)
  assert(trace.includes('assertion-dispose'))
} else {
  assert.equal(rejected, false)
  assert.equal(prepared, requested ? 1 : 0)
  assert.equal(bodies, ['empty', 'skip'].includes(mode) ? 0 : 1)
  if (requested) {
    assert(
      trace.indexOf('prepared:' + preparedState) > trace.indexOf('snapshot')
    )
    assert.equal(packs[0].taskUpdateIds[0], actualFile.id)
    assert.equal(
      packs[0].taskTree.result.state,
      mode === 'empty' ? 'fail' : mode === 'skip' ? 'skip' : 'run'
    )
    assert(
      trace.indexOf('pack:' + packs[0].taskTree.result.state) <
        trace.indexOf('case-start') || bodies === 0
    )
  }
  if (mode === 'cleanup-failure') {
    assert.equal(result.cases[0].status, 'passed')
    assert(result.errors.some((f) => f.error === fault))
  }
  if (mode === 'empty') {
    assert.equal(result.errors.length, 1)
    assert.equal(result.cases.length, 0)
    assert.equal(preparedResult.state, 'fail')
  }
  if (mode === 'send-failure') {
    assert(updateRejected)
    assert(
      updateReason === fault || updateReason.errors.every((e) => e === fault)
    )
  } else assert.equal(updateRejected, false)
}
assert.equal(prepared <= 1, true)
writeFileSync(
  output,
  JSON.stringify(
    {
      mode,
      trace,
      bodies,
      prepared,
      metaReads,
      actualRootIdentity: true,
      preparedResultIdentity:
        preparedResult === actualFile.result || prepared === 0,
      sourceRuntime: { execPath: process.execPath, versions: process.versions },
    },
    null,
    2
  ) + '\n'
)
