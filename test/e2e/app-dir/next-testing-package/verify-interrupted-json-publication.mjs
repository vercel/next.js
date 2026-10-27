import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [rootArg, outputArg, kind = 'installed'] = process.argv.slice(2)
assert(rootArg && outputArg)
assert(['source', 'installed'].includes(kind))
const root = fs.realpathSync(rootArg),
  output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const corpus = path.join(directory, 'sigint-json-publication')
const manifest = JSON.parse(
  fs.readFileSync(path.join(corpus, 'reference.json'))
)
const load = createRequire(path.join(root, 'package.json'))
const next =
  kind === 'source'
    ? path.join(root, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next')
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const save = (dir, name, value) =>
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n')
const previous = Buffer.from('{"previous":"complete-json-report"}\n')
const facts = []
fs.mkdirSync(output)
for (const profile of manifest.profiles) {
  const sourceName =
    profile.runtime === 'node'
      ? 'node-active.test.mjs.txt'
      : 'browser-pending.test.mjs.txt'
  const source = path.join(corpus, sourceName)
  assert.equal(hash(source), manifest.sourceSHA256[sourceName])
  const destination = path.join(output, profile.label)
  fs.mkdirSync(destination)
  const fixture = fs.mkdtempSync(path.join(root, '.next-test-sigint-json-'))
  let completed = false,
    signaled = false,
    gateError
  try {
    fs.copyFileSync(source, path.join(fixture, 'fixtures.test.mjs'))
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    fs.symlinkSync(
      path.join(root, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
    )
    const test = {
      mode: profile.mode,
      environment: profile.runtime,
      maxWorkers: 1,
      include: ['fixtures.test.mjs'],
      testTimeout: profile.runtime === 'browser' ? 5000 : 30000,
      hookTimeout: 30000,
      includeTaskLocation: false,
    }
    if (profile.runtime === 'browser')
      test.browser = {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
      }
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({ test }) + '\n'
    )
    const report = path.join(destination, 'report.json'),
      trace = path.join(destination, 'trace.jsonl'),
      marker = path.join(destination, 'body-started'),
      native = path.join(destination, 'native-click.jsonl')
    if (profile.target === 'prior') fs.writeFileSync(report, previous)
    const env = {
      ...process.env,
      NODE_ENV: profile.mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      NEXT_TEST_JSON_BODY_GATE: marker,
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const args = [
      next,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + report,
    ]
    if (profile.runtime === 'browser') {
      const reporter = path.join(fixture, 'cleanup-reporter.mjs')
      fs.copyFileSync(
        path.join(directory, 'browser-public-default-cleanup/reporter.mjs'),
        reporter
      )
      args.push('--reporter=' + reporter)
      env.CONCURRENCY_TRACE = trace
      env.NODE_OPTIONS =
        '--require=' + path.join(corpus, 'native-click-observer.cjs')
      env.NEXT_TEST_NATIVE_CLEANUP_BASE = path.join(fixture, 'package.json')
      env.NEXT_TEST_NATIVE_CLEANUP_TRACE = native
    }
    const starts = () => {
      const file = path.join(destination, 'owners/starts.jsonl')
      return fs.existsSync(file)
        ? fs
            .readFileSync(file, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((row) => JSON.parse(row))
        : []
    }
    const interrupt = () => {
      const cli = starts().find(
        (row) => row.type === 'start' && row.ppid === process.pid
      )
      assert(cli, 'Owned CLI start must be recorded before SIGINT')
      const actual = spawnSync('ps', ['-p', String(cli.pid), '-o', 'lstart='], {
        encoding: 'utf8',
      })
      assert.equal(actual.status, 0)
      assert.equal(actual.stdout.trim().split(/\s+/).join(' '), cli.started)
      process.kill(cli.pid, 'SIGINT')
      signaled = true
      save(destination, 'signal.json', {
        pid: cli.pid,
        started: cli.started,
        signal: 'SIGINT',
        actualGateStarted: fs.existsSync(
          profile.runtime === 'browser' ? native : marker
        ),
      })
    }
    const running = runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(destination, 'owners'),
      timeoutMs: 90000,
    }).then((result) => {
      completed = true
      return result
    })
    try {
      const gate = profile.runtime === 'browser' ? native : marker
      const deadline = performance.now() + 30000
      while (!fs.existsSync(gate) && performance.now() < deadline) {
        assert(!completed, 'CLI ended before the actual execution gate')
        await delay(25)
      }
      assert(fs.existsSync(gate), 'Actual execution gate must begin in30s')
      interrupt()
    } catch (error) {
      gateError = error
    } finally {
      if (!completed && !signaled) interrupt()
    }
    const owner = await running
    save(destination, 'owner.json', owner)
    fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.label)
    assert.equal(
      hash(path.join(fixture, 'fixtures.test.mjs')),
      manifest.sourceSHA256[sourceName]
    )
    if (gateError) throw gateError
    assert.equal(owner.status, profile.exit)
    assert.equal(owner.signal, null)
    if (profile.target === 'prior')
      assert.deepEqual(fs.readFileSync(report), previous)
    else assert.equal(fs.existsSync(report), false)
    if (profile.runtime === 'browser') {
      const rows = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8') : ''
      for (const text of [
        '"phase":"physical-click"',
        'late-physical-click',
        'component-native-settled',
        'worker-joined-component-native',
        'worker-cleanup-end',
      ])
        assert(!rows.includes(text))
      assert.equal(fs.existsSync(trace + '.complete.json'), false)
      const actions = fs
        .readFileSync(native, 'utf8')
        .trim()
        .split('\n')
        .map((row) => JSON.parse(row))
      assert.equal(actions.length, 1)
      assert.equal(actions[0].phase, 'real-native-click-started')
    }
    facts.push({
      label: profile.label,
      exit: owner.status,
      actualExecutionStarted: true,
      noInterruptedJsonPublished: true,
      priorBytesPreserved: profile.target === 'prior',
      allOwnersClosed: true,
    })
    save(output, 'checks.json', { facts })
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}
save(output, 'verified.json', {
  profiles: facts.length,
  nodeProfiles: 4,
  browserProfiles: 2,
  actualSigintDuringOneShotExecution: true,
  allInterruptedJsonTargetsExact: true,
  actualPendingNativeClickAndNoFulfilledTail: true,
  noCustomFinalPublication: true,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  otherSignalsAndCancellationAPIsQualified: false,
  jsonOnlyBrowserNativeExecutionQualified: false,
  facts,
})
