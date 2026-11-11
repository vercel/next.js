import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [nextPackage, workRoot, output, compilerRoot] = process.argv.slice(2)
assert(nextPackage && workRoot && output && compilerRoot)
mkdirSync(workRoot, { recursive: true })
mkdirSync(output, { recursive: true })
const fixture = fileURLToPath(
  new URL('./fixtures/signal-exit/contract.test.mjs.txt', import.meta.url)
)
const source = readFileSync(fixture)
const require = createRequire(import.meta.url)
const { acquireTestRunLock } = require(
  join(nextPackage, 'dist/experimental/testing/scheduling.js')
)
const facts = []
for (const mode of ['development', 'production']) {
  for (const failed of [false, true]) {
    for (const control of ['signal', 'api']) {
      const label = [
        mode,
        failed ? 'failed-then-held' : 'held-only',
        control,
      ].join('-')
      const app = join(workRoot, label)
      const out = join(output, label)
      mkdirSync(app)
      mkdirSync(out)
      writeFileSync(
        join(app, 'package.json'),
        '{"type":"module","private":true}\n'
      )
      writeFileSync(
        join(app, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: compilerRoot } }) +
          '\n'
      )
      writeFileSync(
        join(app, 'next.test.config.json'),
        JSON.stringify({
          test: {
            name: 'history',
            environment: 'node',
            mode,
            include: ['contract.test.mjs'],
            maxWorkers: 1,
            fileParallelism: false,
            testTimeout: 20000,
            hookTimeout: 20000,
          },
        }) + '\n'
      )
      copyFileSync(fixture, join(app, 'contract.test.mjs'))
      const env = {
        ...process.env,
        NODE_ENV: mode,
        FORCE_COLOR: '0',
        NEXT_TELEMETRY_DISABLED: '1',
      }
      for (const key of [
        'CI',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      const cache = join(app, '.next-test-cache/results.json')
      writeFileSync(
        join(app, 'control.json'),
        JSON.stringify({ failed: false, hold: false }) + '\n'
      )
      const prime = await runOwnedNode(
        [
          join(nextPackage, 'dist/bin/next'),
          'test',
          app,
          '--run',
          '--reporter=json',
          '--outputFile=' + join(out, 'prime.raw.json'),
        ],
        { cwd: app, env, auditDir: join(out, 'prime-owner'), timeoutMs: 120000 }
      )
      writeFileSync(
        join(out, 'PRIME-OWNER.json'),
        JSON.stringify(prime, null, 2) + '\n'
      )
      assertOwnedNodeCompleted(prime, label + ' prime')
      assert.equal(prime.status, 0, prime.stderr)
      const priorCache = readFileSync(cache)
      const prior = JSON.parse(priorCache)
      assert.equal(prior.version, 1)
      assert.equal(
        prior.projects.history.files['contract.test.mjs'].failed,
        false
      )
      writeFileSync(
        join(app, 'control.json'),
        JSON.stringify({ failed, hold: true }) + '\n'
      )
      rmSync(join(app, 'phase-after-all.json'))
      const owned = await runOwnedNode(
        [
          fileURLToPath(
            new URL('./signal-exit-controller.mjs', import.meta.url)
          ),
          nextPackage,
          app,
          control,
          out,
        ],
        {
          cwd: app,
          env,
          auditDir: join(out, 'signal-owner'),
          timeoutMs: 120000,
        }
      )
      writeFileSync(
        join(out, 'OWNER.json'),
        JSON.stringify(owned, null, 2) + '\n'
      )
      assertOwnedNodeCompleted(owned, label + ' interruption')
      const observed = JSON.parse(readFileSync(join(out, 'CONTROL.json')))
      assert.equal(observed.bodyReady, true)
      assert.equal(observed.bodyDeadlineExceeded, undefined)
      assert.equal(observed.controlError, undefined)
      assert.equal(observed.cliClosed, true)
      const expectedExit = control === 'signal' || !failed ? 130 : 1
      assert.equal(owned.status, expectedExit, JSON.stringify(observed))
      assert.deepEqual(observed.exit, { code: expectedExit, signal: null })
      assert.deepEqual(
        JSON.parse(readFileSync(join(app, 'phase-aborted.json'))),
        { aborted: true }
      )
      assert.deepEqual(
        JSON.parse(readFileSync(join(app, 'phase-after-all.json'))),
        { closed: true }
      )
      assert.deepEqual(readFileSync(cache), priorCache)
      assert.deepEqual(readFileSync(join(app, 'contract.test.mjs')), source)
      let report
      if (control === 'signal')
        assert.equal(existsSync(join(out, 'report.raw.json')), false)
      else {
        report = JSON.parse(readFileSync(join(out, 'report.raw.json')))
        assert.equal(
          report.next.summary.status,
          failed ? 'failed' : 'cancelled'
        )
        assert.equal(report.next.summary.cases.failed, failed ? 1 : 0)
        assert.equal(report.next.summary.cases.cancelled, 1)
        assert.equal(report.numTotalTests, failed ? 2 : 1)
      }
      const artifacts = readdirSync(app, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.startsWith('.next-test-') &&
            entry.name !== '.next-test-cache'
        )
        .map((entry) => entry.name)
      assert.deepEqual(artifacts, [])
      assert.deepEqual(readdirSync(dirname(cache)), ['results.json'])
      const lock = await acquireTestRunLock(app, { recoverSnapshots: false })
      await lock.unlock()
      const row = {
        label,
        mode,
        failed,
        control,
        exit: observed.exit,
        sourceUnchanged: true,
        historyBytesUnchanged: true,
        workerAndAfterAllCleanupComplete: true,
        artifactDirectoriesReleased: true,
        applicationLockReacquired: true,
        reportOmitted: control === 'signal',
        persistentHistoryRoleChecked: true,
      }
      facts.push(row)
      writeFileSync(
        join(out, 'OBSERVED.json'),
        JSON.stringify({ ...row, prior, observed, report }, null, 2) + '\n'
      )
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          { runtime: process.version, facts, complete: facts.length === 8 },
          null,
          2
        ) + '\n'
      )
    }
  }
}
console.log(
  JSON.stringify({
    profiles: 8,
    actualCliRuns: 16,
    actualSignalCancellations: 4,
    actualApiCancellations: 4,
    historyBytesPreserved: true,
    allOwnedWorkersAndArtifactsReleased: true,
  })
)
