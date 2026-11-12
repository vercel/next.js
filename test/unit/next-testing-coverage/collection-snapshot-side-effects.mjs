import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, name, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, NODE_ENV: 'development', CI: '1' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, name, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual collection snapshot side effects ' + name
  )
  assert.equal(owner.status, 0, owner.stderr)
} else {
  assert(
    [
      'failed-default',
      'failed-truthy',
      'failed-optin',
      'failed-finalize-error',
      'successful-optin',
    ].includes(name)
  )
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const fixture = mkdtempSync(
    join(consumer, '.next-collection-snapshot-effects-')
  )
  const filePath = join(fixture, 'contract.test.mjs')
  const prior =
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`prior snapshot control 1`] = `"prior"`;\n'
  writeFileSync(filePath, '// actual component snapshot owner\n')
  mkdirSync(join(fixture, '__snapshots__'))
  writeFileSync(join(fixture, '__snapshots__/contract.test.mjs.snap'), prior)
  const authoredError = new Error('actual collection failure')
  const disposalError = new Error(
    'independent actual assertion disposal failure'
  )
  const authoredFields = Object.getOwnPropertyDescriptors(authoredError)
  let assertions,
    finishCalls = 0,
    actualFinishedSummary
  const successful = name === 'successful-optin'
  const file = runner.initializeTestFile({
    fileId: 'actual-snapshot-effects',
    filePath,
    snapshotUpdateMode: 'all',
    ...(name !== 'failed-default'
      ? {
          omitFailedCollectionSnapshotSummary:
            name === 'failed-truthy' ? 'true' : true,
        }
      : {}),
  })
  try {
    const collect = file.collect(async () => {
      assertions = runner.getAssertionRuntime()
      const finish = assertions.finishFile
      assertions.finishFile = async function (...args) {
        finishCalls++
        const result = await Reflect.apply(finish, this, args)
        actualFinishedSummary = assertions.getSnapshotSummary()
        if (name === 'failed-finalize-error') throw disposalError
        return result
      }
      file.api.test('prior snapshot control', () => {
        assertions.expect('prior').toMatchSnapshot()
      })
      if (!successful) throw authoredError
    })
    if (successful) await collect
    else await assert.rejects(collect, (error) => error === authoredError)
    assert.equal(file.getSnapshotSummary(), undefined)
    if (successful) {
      const result = await file.run({
        runId: 'actual-snapshot-effects-run',
        signal: new AbortController().signal,
      })
      assert.equal(result.cases.length, 1)
      assert.equal(result.cases[0].status, 'passed')
    }
    if (name === 'failed-finalize-error')
      await assert.rejects(file.dispose(), (error) => error === disposalError)
    else await file.dispose()
    assert.equal(finishCalls, 1)
    assert(
      actualFinishedSummary,
      'Actual primitive finishFile must still produce its own summary'
    )
    assert.equal(actualFinishedSummary.unchecked, successful ? 0 : 1)
    const summary = file.getSnapshotSummary()
    if (name === 'failed-default' || name === 'failed-truthy' || successful)
      assert.deepEqual(summary, actualFinishedSummary)
    else assert.equal(summary, undefined)
    assert.equal(file.canPublishSnapshots(), successful)
    if (successful) assert.deepEqual(file.takeSnapshotUpdates(), [])
    else
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
    assert.deepEqual(
      Object.getOwnPropertyDescriptors(authoredError),
      authoredFields
    )
    assert.equal(
      readFileSync(
        join(fixture, '__snapshots__/contract.test.mjs.snap'),
        'utf8'
      ),
      prior
    )
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          name,
          actualPrimitiveFinalizerCalledOnce: true,
          actualPrimitiveSummaryRetained: true,
          privateReportingOptInOnly: true,
          originalDisposalErrorPropagated:
            name === 'failed-finalize-error' ? true : undefined,
          snapshotEligibilityUnchanged: true,
          priorSnapshotBytesExact: true,
          rawAuthoredErrorUnchanged: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    try {
      await file.dispose()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
}
