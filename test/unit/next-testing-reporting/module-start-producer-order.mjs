import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const {
  createReporterTaskUpdates,
} = require('next/dist/experimental/testing/reporting/task-updates')
const [mode, output] = process.argv.slice(2),
  root = mkdtempSync(join(tmpdir(), 'next-module-start-order-')),
  filePath = join(root, 'case.mjs'),
  trace = [],
  fault = new Error('owned ' + mode)
writeFileSync(filePath, '// actual private File/resource preparation control\n')
let file,
  actualFile,
  preparedResult,
  rootSuite,
  bodies = 0
const updates = createReporterTaskUpdates({
  captureModuleStart: true,
  onUpdate(update) {
    trace.push('pack:' + update.taskTree.result?.state)
  },
})
try {
  file = initializeTestFile({
    fileId: 'owned-resource-file',
    filePath,
    preparePublicSnapshots: true,
    publicTaskSelection: true,
    snapshotUpdateMode: 'none',
  })
  await file.collect(async () => {
    const test = file.api.test.extend({
      resource: [
        // This fixture has no declared dependencies.
        // eslint-disable-next-line no-empty-pattern
        async ({}, provideResource) => {
          trace.push('fixture-setup')
          if (mode === 'setup-failure') throw fault
          await provideResource(1)
          trace.push('fixture-dispose')
          if (mode === 'cleanup-failure') throw fault
        },
        { scope: 'file', auto: true },
      ],
    })
    test('actual body', () => {
      bodies++
      trace.push('body')
    })
  })
  const result = await file.run({
    runId: 'actual-resource-preparation',
    signal: new AbortController().signal,
    captureModuleStart: true,
    onCollected(current) {
      actualFile = current
      trace.push('collected')
      updates.collected(current)
    },
    onFilePrepared(current) {
      assert.equal(current, actualFile)
      assert.equal(current.result.state, 'run')
      preparedResult = current.result
      trace.push('root-prepared')
      updates.filePrepared(current)
    },
    onCaseStart(context) {
      trace.push('case-start')
      updates.caseStart(context.testId)
    },
    onCaseResult(task, result) {
      updates.caseResult(task, result)
    },
    onSuiteEnd(suite, task) {
      if (suite.suiteId === 'owned-resource-file') {
        rootSuite = suite
        trace.push('root-suite-end')
        assert.equal(task, actualFile)
      }
      updates.suiteEnd(task)
    },
  })
  await updates.finish()
  await file.dispose()
  file = undefined
  assert.equal(actualFile.result, preparedResult)
  assert.equal(trace.filter((x) => x === 'root-prepared').length, 1)
  assert(trace.indexOf('collected') < trace.indexOf('root-prepared'))
  assert(trace.indexOf('root-prepared') < trace.indexOf('pack:run'))
  assert(trace.indexOf('pack:run') < trace.indexOf('fixture-setup'))
  assert(trace.indexOf('fixture-setup') < trace.indexOf('root-suite-end'))
  assert.equal(bodies, mode === 'setup-failure' ? 0 : 1)
  assert.equal(
    result.cases[0].status,
    mode === 'setup-failure' ? 'failed' : 'passed'
  )
  if (mode === 'cleanup-failure') {
    assert.equal(rootSuite.errors.length, 1)
    assert.equal(rootSuite.errors[0].error, fault)
  } else assert.deepEqual(rootSuite.errors, [])
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        trace,
        bodies,
        actualRootAndResultIdentity: true,
        actualLeadingPackBeforeLazyResource: true,
        originalSetupCleanupOwnershipHeld: true,
        allFileScopesJoined: true,
        execPath: process.execPath,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  updates.dispose()
  await file?.dispose()
  rmSync(root, { recursive: true, force: true })
}
