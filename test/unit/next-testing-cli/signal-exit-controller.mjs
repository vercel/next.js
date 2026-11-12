import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, watchFile, unwatchFile, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [nextPackage, app, control, evidence] = process.argv.slice(2)
const facts = { control }
const gate = join(app, 'phase-ready.json')
const child = spawn(
  process.execPath,
  [
    join(nextPackage, 'dist/bin/next'),
    'test',
    app,
    '--run',
    ...(control === 'api' ? ['--api', '0'] : []),
    '--reporter=json',
    '--outputFile=' + join(evidence, 'report.raw.json'),
  ],
  { cwd: app, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
)
const closed = once(child, 'close')
let stdout = '',
  stderr = '',
  url,
  started = false,
  pending
const save = () =>
  writeFileSync(
    join(evidence, 'CONTROL.json'),
    JSON.stringify(facts, null, 2) + '\n'
  )
async function trigger() {
  if (started) return
  let marker
  try {
    marker = JSON.parse(readFileSync(gate, 'utf8'))
  } catch {
    return
  }
  if (control === 'api' && !url) return
  started = true
  facts.marker = marker
  facts.bodyReady = true
  try {
    assert.deepEqual(marker, { realSignal: true, abortedAtEntry: false })
    if (control === 'signal') {
      facts.signalSent = child.kill('SIGINT')
      assert.equal(facts.signalSent, true)
    } else {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200)
      const discovery = await response.json()
      assert.equal(discovery.run.status, 'running')
      assert.equal(discovery.controls.cancel, true)
      facts.discovery = discovery
      const response2 = await fetch(
        new URL(
          '/v1/runs/' + encodeURIComponent(discovery.run.id) + '/cancel',
          url
        ),
        { method: 'POST', signal: AbortSignal.timeout(5000) }
      )
      assert.equal(response2.status, 202)
      facts.acknowledgement = await response2.json()
      assert.equal(facts.acknowledgement.status, 'accepted')
    }
  } catch (error) {
    facts.controlError = { name: error.name, message: error.message }
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM')
  }
  save()
}
function observe() {
  if (!started) pending = trigger()
}
watchFile(gate, { interval: 20 }, observe)
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
  url ??=
    /Next test discovery API: (http:\/\/127\.0\.0\.1:\d+\/v1\/discovery)/.exec(
      stderr
    )?.[1]
  observe()
})
const deadline = setTimeout(() => {
  if (!started) {
    facts.bodyDeadlineExceeded = true
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM')
    save()
  }
}, 30000)
observe()
try {
  const [code, signal] = await closed
  await pending
  facts.exit = { code, signal }
  facts.cliClosed = true
  save()
  writeFileSync(join(evidence, 'stdout.log'), stdout)
  writeFileSync(join(evidence, 'stderr.log'), stderr)
  process.exitCode = code ?? 1
} finally {
  clearTimeout(deadline)
  unwatchFile(gate, observe)
}
