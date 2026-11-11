const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

async function runReporterCommand({
  root,
  args,
  mode,
  timeoutMs = 35000,
  cleanupMs = 10000,
  timeoutMessage,
  cleanupMessage,
  stdio,
}) {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  if (mode !== undefined) env.NODE_ENV = mode
  delete env.CI
  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, '../../../packages/next/dist/bin/next'),
      'test',
      root,
      ...args,
    ],
    { cwd: root, env, detached: process.platform !== 'win32', stdio }
  )
  let stdout = '',
    stderr = '',
    closed = false,
    timer
  child.stdout.on('data', (data) => (stdout += data))
  child.stderr.on('data', (data) => (stderr += data))
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      closed = true
      resolve({ code, signal })
    })
  })
  try {
    const ended = await Promise.race([
      completion,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
    assert.equal(ended.signal, null)
    return { ...ended, stdout, stderr }
  } finally {
    clearTimeout(timer)
    if (!closed) {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
      await Promise.race([
        completion,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(cleanupMessage)), cleanupMs)
        }),
      ]).finally(() => clearTimeout(timer))
    }
  }
}

function assertForeignReport(imported, expected, blob) {
  assert.equal(imported.next, undefined)
  assert.equal(imported.vitest.attemptHistory, 'unavailable')
  assert.equal(imported.vitest.runBoundaries, 'unavailable')
  assert.equal(imported.vitest.environmentGraphs, 'opaque-not-restored')
  assert.deepEqual(imported.vitest.blobs[0].flatted, blob)
  expected.startTime = imported.startTime
  for (const file of expected.testResults)
    if (file.assertionResults.every((test) => test.duration === undefined)) {
      file.startTime = imported.startTime
      file.endTime = imported.startTime
    }
  const { vitest: foreign, ...standard } = imported
  assert.equal(foreign.version, '5.0.4')
  assert.deepEqual(standard, expected)
}

function retainReporterEvidence(root, result, evidence, name) {
  if (!evidence) return
  const dest = path.join(evidence, name)
  fs.mkdirSync(dest, { recursive: true })
  for (const file of ['rows.json', 'merged.json'])
    if (fs.existsSync(path.join(root, file)))
      fs.copyFileSync(path.join(root, file), path.join(dest, file))
  fs.writeFileSync(path.join(dest, 'outcome.json'), JSON.stringify(result))
}

module.exports = {
  runReporterCommand,
  assertForeignReport,
  retainReporterEvidence,
}
