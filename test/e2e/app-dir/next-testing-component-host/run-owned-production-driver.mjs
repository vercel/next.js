import assert from 'node:assert/strict'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../next-testing-package/process-supervisor.mjs'

// Keep the deadline in this parent: killing only the driver bypasses its finally
// and leaves detached application workers holding the production output lock.
const [timeout, auditDir, ...args] = process.argv.slice(2)
const timeoutMs = Number(timeout)
assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0)
const result = await runOwnedNode(args, {
  cwd: process.cwd(),
  env: { ...process.env },
  auditDir,
  timeoutMs,
})
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
assertOwnedNodeCompleted(result, 'production browser driver')
assert.equal(result.status, 0, 'Production browser driver failed')
