import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const output = resolve(process.argv[2])
mkdirSync(output)
const cli = fileURLToPath(
  new URL('./supervisor-fixtures/cli.cjs', import.meta.url)
)
const env = { ...process.env }
delete env.NODE_OPTIONS
delete env.NODE_PATH
const results = []
for (const mode of ['hang', 'exit', 'immediate']) {
  const result = await runOwnedNode([cli, mode], {
    cwd: output,
    env,
    auditDir: join(output, mode),
    timeoutMs: 1200,
    graceMs: 100,
    cleanupMs: 3000,
  })
  assert.throws(
    () => assertOwnedNodeCompleted(result, mode),
    mode === 'hang'
      ? /deadline exceeded/
      : mode === 'immediate'
        ? /missing descendant startup records/
        : /unexpected live owned workers/
  )
  assert.equal(result.timedOut, mode === 'hang')
  assert.equal(result.status, mode === 'hang' ? null : 0)
  assert.equal(result.auditMissing, false)
  assert.equal(result.ownedProcesses.length, 2)
  assert.equal(result.leakedProcesses.length, 1)
  assert.equal(result.spawnedProcesses.length, 1)
  assert.equal(
    result.missingStartupRecords.length,
    mode === 'immediate' ? 1 : 0
  )
  assert.deepEqual(result.cleanupFailures, [])
  assert.notEqual(result.ownedProcesses[0].pgid, result.ownedProcesses[1].pgid)
  for (const { pid } of result.ownedProcesses) {
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  }
  results.push({
    mode,
    timedOut: result.timedOut,
    status: result.status,
    reclaimedPids: result.ownedProcesses.map(({ pid }) => pid),
    detectedLeaks: result.leakedProcesses.length,
    missingStartupRecords: result.missingStartupRecords.length,
    cleanupFailures: result.cleanupFailures,
  })
}
writeFileSync(join(output, 'passed.json'), JSON.stringify(results, null, 2))
console.log(
  'Controlled hanging, ready-worker and immediate-parent-exit checks passed'
)
