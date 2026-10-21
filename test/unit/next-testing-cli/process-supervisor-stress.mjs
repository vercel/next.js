import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const root = mkdtempSync(join(tmpdir(), 'next-test-closed-processes-'))
const results = []
try {
  writeFileSync(
    join(root, 'many-closed.mjs'),
    `import { spawn } from 'node:child_process'
let next = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next++ < 400) await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', detached: true })
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 && signal === null ? resolve() : reject(new Error('Actual child did not close successfully')))
  })
}))
`
  )
  writeFileSync(
    join(root, 'live-worker.mjs'),
    "process.send('ready')\nsetInterval(() => {}, 10000)\n"
  )
  writeFileSync(
    join(root, 'leaving-worker.mjs'),
    `import { fork } from 'node:child_process'
const child = fork(new URL('./live-worker.mjs', import.meta.url), { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject) })
child.disconnect()
child.unref()
`
  )
  for (const control of ['closed', 'live-child', 'timeout']) {
    const args =
      control === 'timeout'
        ? ['-e', 'setInterval(() => {}, 10000)']
        : [
            join(
              root,
              control === 'closed' ? 'many-closed.mjs' : 'leaving-worker.mjs'
            ),
          ]
    const result = await runOwnedNode(args, {
      cwd: root,
      env: { ...process.env },
      auditDir: join(root, control),
      timeoutMs: control === 'timeout' ? 1000 : 120000,
    })
    results.push({ control, result })
    assert.deepEqual(result.cleanupFailures, [])
    assert.deepEqual(result.pendingRegistrations, [])
    assert.deepEqual(result.registrationFailures, [])
    assert.deepEqual(result.missingStartupRecords, [])
    assert.equal(result.auditMissing, false)
    if (control === 'closed') {
      assertOwnedNodeCompleted(result, 'closed descendant stress')
      assert.equal(result.status, 0)
      assert.equal(result.signal, null)
      assert.equal(result.ownedProcesses.length, 401)
    } else {
      assert.throws(() =>
        assertOwnedNodeCompleted(result, 'intentional negative')
      )
      if (control === 'live-child') {
        assert.equal(result.status, 0)
        assert.equal(result.timedOut, false)
        assert.equal(result.leakedProcesses.length, 1)
      } else assert.equal(result.timedOut, true)
    }
  }
  console.log(
    JSON.stringify({
      closedChildren: 400,
      actualOwnedRecords: 401,
      cleanupBudgetMs: 3000,
      liveChildRejected: true,
      deadlineRejected: true,
    })
  )
} finally {
  const evidence = process.env.NEXT_TESTING_CLEANUP_STRESS_EVIDENCE
  if (evidence) {
    mkdirSync(evidence, { recursive: true })
    cpSync(root, join(evidence, 'actual'), { recursive: true })
    writeFileSync(
      join(evidence, 'results.json'),
      JSON.stringify(results, null, 2)
    )
  }
  rmSync(root, { recursive: true, force: true })
}
