const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const cp = require('node:child_process')
const { createRequire } = require('node:module')
const { getEventListeners } = require('node:events')
const project = process.argv[2]
const outcome = process.argv[3] ?? 'passed'
assert(['passed', 'failed'].includes(outcome))
assert(project)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
const { executeWithEnvironment } = req(
  next + '/dist/experimental/testing/execution/execute'
)
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-console-drain-cancel-')
)
const originalCreate = fs.promises.mkdtemp
const caches = []
fs.promises.mkdtemp = async (...args) => {
  const dir = await originalCreate(...args)
  if (String(args[0]).includes('next-test-cache-')) caches.push(dir)
  return dir
}
const live = setInterval(() => {}, 100)
const events = []
const controller = new AbortController()
const reason = new Error('actual parent cancelled while console callback waits')
let calls = 0
async function main() {
  try {
    const compiled = path.join(root, 'compiled')
    fs.mkdirSync(compiled)
    const pidPath = path.join(root, 'worker.pid'),
      disposed = path.join(root, 'environment.disposed'),
      provider = path.join(root, 'environment.mjs')
    fs.writeFileSync(
      provider,
      `import fs from'node:fs';export default{name:'actual-custom',viteEnvironment:'ssr',setup(){fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));return{teardown(){fs.writeFileSync(${JSON.stringify(disposed)},'actual teardown')}}}}\n`
    )
    fs.writeFileSync(
      path.join(compiled, 'entry.cjs'),
      `const runner=require(${JSON.stringify(req.resolve('next/dist/experimental/testing/runner'))});exports.testRunner=runner;exports.loadTestModule=async()=>{runner.getTestApi().test('case settles before pending console callback',()=>{console.log('actual console before teardown');if(${JSON.stringify(outcome)}==='failed')throw new Error('actual earlier case failure')})}\n`
    )
    const profile = {
      id: 'console-drain',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    const entry = {
      id: 'console-drain:case',
      file: path.join(root, 'probe.test.mjs'),
      profile,
      executionEnvironment: { name: provider },
    }
    fs.writeFileSync(entry.file, '// Controlled real-worker protocol fixture\n')
    const result = await executeWithEnvironment(
      {
        version: 2,
        kind: 'node',
        entryId: entry.id,
        profile,
        revision: 'console-drain-cancel',
        rootDir: compiled,
        entryPath: 'entry.cjs',
        files: ['entry.cjs'],
        diagnostics: [],
      },
      {
        runId: 'console-drain-cancel',
        entry,
        projectDir: root,
        signal: controller.signal,
        setupFiles: [],
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 5000,
        snapshotUpdateMode: 'none',
        onEvent: (event) => events.push(event),
        onConsoleDrain() {
          calls++
          queueMicrotask(() => controller.abort(reason))
          return new Promise(() => {})
        },
      },
      { ...process.env }
    )
    assert.equal(calls, 1)
    assert.equal(result.status, outcome === 'failed' ? 'failed' : 'cancelled')
    assert(events.some((x) => x.type === 'case-end' && x.status === outcome))
    assert(
      events.some(
        (x) =>
          x.type === 'output' &&
          x.console &&
          x.text.includes('actual console before teardown')
      )
    )
    assert.equal(fs.readFileSync(disposed, 'utf8'), 'actual teardown')
    if (outcome === 'failed')
      assert(
        events.some(
          (event) =>
            event.type === 'case-end' &&
            event.errors?.some(
              (error) => error.message === 'actual earlier case failure'
            )
        )
      )
    assert(caches.length > 0)
    assert(caches.every((dir) => !fs.existsSync(dir)))
    const pid = Number(fs.readFileSync(pidPath, 'utf8'))
    const processes = cp
      .execFileSync('ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
    assert(processes.every(([p, g]) => p !== pid && g !== pid))
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    process.stdout.write(
      JSON.stringify({
        actualCaseOutcome: outcome,
        actualFileOutcome: result.status,
        earlierCaseErrorRetained:
          outcome === 'failed'
            ? events.some(
                (event) =>
                  event.type === 'case-end' &&
                  event.errors?.some(
                    (error) => error.message === 'actual earlier case failure'
                  )
              )
            : null,
        actualConsoleDelivered: true,
        unsettledCallbackDoesNotHoldExecution: true,
        realEnvironmentTeardown: true,
        fileProcessAndGroupAbsent: true,
        cachesRemoved: caches.length,
        signalListenersRemoved: true,
      }) + '\n'
    )
  } finally {
    clearInterval(live)
    fs.promises.mkdtemp = originalCreate
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  process.stderr.write(String(error.stack || error) + '\n')
  process.exitCode = 1
})
