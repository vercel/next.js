const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'cjs-reset')
const fixture = fs.mkdtempSync(path.join(repo, '.next-test-cjs-reset-'))
for (const name of fs.readdirSync(source)) {
  fs.copyFileSync(
    path.join(source, name),
    path.join(fixture, name.replace(/\.txt$/, ''))
  )
}
fs.symlinkSync(
  path.join(repo, 'node_modules'),
  path.join(fixture, 'node_modules')
)
fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'cjs-reset',
        environment: 'node',
        include: ['*.test.mjs'],
      },
    ],
  })
)
const env = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
}
delete env.CI
const child = spawn(
  process.execPath,
  [
    path.join(repo, 'packages/next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter',
    'json',
    '--outputFile',
    'result.json',
  ],
  { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
)
const stdout = []
const stderr = []
let forced = false
let killTimer
child.stdout.on('data', (chunk) => stdout.push(chunk))
child.stderr.on('data', (chunk) => stderr.push(chunk))
const deadline = setTimeout(() => {
  forced = true
  process.kill(-child.pid, 'SIGTERM')
  killTimer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5000)
}, 120000)

;(async () => {
  let close
  try {
    close = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    clearTimeout(deadline)
    clearTimeout(killTimer)
    const report = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
    )
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) =>
        event.text
          .split('\n')
          .filter((line) => line.startsWith('WS2_CJS_RESET_RAW:'))
          .map((line) => ({
            stream: event.stream,
            value: JSON.parse(line.slice('WS2_CJS_RESET_RAW:'.length)),
          }))
      )
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    const actual = {
      pid: child.pid,
      close,
      forced,
      rows,
      cases: cases.map((test) => ({
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      })),
      diagnostics: report.next.events.filter(
        (event) =>
          event.type === 'diagnostic' && event.diagnostic.severity === 'error'
      ),
    }
    process.stdout.write(JSON.stringify(actual) + '\n')
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 3)
    assert.equal(report.numPassedTests, 3)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numPendingTests, 0)
    assert.equal(report.numTodoTests, 0)
    assert.deepEqual(actual.diagnostics, [])
    assert.deepEqual(
      actual.cases,
      JSON.parse(
        fs.readFileSync(path.join(source, 'pristine-cases.json'), 'utf8')
      )
    )
    assert.deepEqual(
      cases.map((test) => test.status),
      ['passed', 'passed', 'passed']
    )
    assert.deepEqual(
      cases.map((test) => test.failureMessages),
      [[], [], []]
    )
    assert.deepEqual(
      rows,
      JSON.parse(
        fs.readFileSync(path.join(source, 'pristine-rows.json'), 'utf8')
      )
    )
  } finally {
    clearTimeout(deadline)
    clearTimeout(killTimer)
    if (close && !forced) fs.rmSync(fixture, { recursive: true, force: true })
    if (forced || !close) {
      process.stderr.write(Buffer.concat(stdout))
      process.stderr.write(Buffer.concat(stderr))
    }
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
